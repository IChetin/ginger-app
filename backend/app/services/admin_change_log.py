from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import User
from app.models.enums import ChangeType, NotificationStatus
from app.models.notifications import NotificationQueue
from app.models.schedule import ChangeLog, Event, Flight, Series
from app.schemas.admin_schedule import ChangeLogListItem
from app.schemas.common import PaginatedResponse, PaginationParams

PeriodFilter = Literal["7", "30", "all"]


def _via_import(new_value: dict[str, object] | None) -> bool:
    if not new_value:
        return False
    if new_value.get("via") == "import":
        return True
    return "import_job_id" in new_value


async def _delivery_counts(
    session: AsyncSession, change_log_ids: list[UUID]
) -> dict[UUID, dict[str, int]]:
    if not change_log_ids:
        return {}
    rows = await session.execute(
        select(
            NotificationQueue.change_log_id,
            NotificationQueue.status,
            func.count(),
        )
        .where(NotificationQueue.change_log_id.in_(change_log_ids))
        .group_by(NotificationQueue.change_log_id, NotificationQueue.status)
    )
    out: dict[UUID, dict[str, int]] = {
        change_id: {"sent": 0, "failed": 0, "pending": 0} for change_id in change_log_ids
    }
    for change_id, status, count in rows.all():
        if change_id is None:
            continue
        bucket = out.setdefault(change_id, {"sent": 0, "failed": 0, "pending": 0})
        if status == NotificationStatus.SENT:
            bucket["sent"] = int(count)
        elif status == NotificationStatus.FAILED:
            bucket["failed"] = int(count)
        elif status == NotificationStatus.PENDING:
            bucket["pending"] = int(count)
    return out


async def _enrich_context(
    session: AsyncSession, entries: list[ChangeLog]
) -> dict[UUID, dict[str, object | None]]:
    series_ids = {e.entity_id for e in entries if e.entity_type == "series"}
    event_ids = {e.entity_id for e in entries if e.entity_type == "event"}
    flight_ids = {e.entity_id for e in entries if e.entity_type == "flight"}

    flights: dict[UUID, Flight] = {}
    if flight_ids:
        for flight in await session.scalars(
            select(Flight)
            .where(Flight.id.in_(flight_ids))
            .options(selectinload(Flight.event).selectinload(Event.series))
        ):
            flights[flight.id] = flight
            if flight.event is not None:
                event_ids.add(flight.event.id)
                series_ids.add(flight.event.series_id)

    events: dict[UUID, Event] = {}
    if event_ids:
        for event in await session.scalars(
            select(Event).where(Event.id.in_(event_ids)).options(selectinload(Event.series))
        ):
            events[event.id] = event
            series_ids.add(event.series_id)

    series_map: dict[UUID, Series] = {}
    if series_ids:
        for row in await session.scalars(select(Series).where(Series.id.in_(series_ids))):
            series_map[row.id] = row

    context: dict[UUID, dict[str, object | None]] = {}
    for entry in entries:
        series_id: UUID | None = None
        series_name: str | None = None
        event_id: UUID | None = None
        event_number: int | None = None
        event_name: str | None = None
        flight_label: str | None = None

        if entry.entity_type == "series":
            series_row = series_map.get(entry.entity_id)
            if series_row:
                series_id = series_row.id
                series_name = series_row.name
        elif entry.entity_type == "event":
            event_row = events.get(entry.entity_id)
            if event_row:
                event_id = event_row.id
                event_number = event_row.number
                event_name = event_row.name
                series_id = event_row.series_id
                if event_row.series is not None:
                    series_name = event_row.series.name
                elif event_row.series_id in series_map:
                    series_name = series_map[event_row.series_id].name
        elif entry.entity_type == "flight":
            flight_row = flights.get(entry.entity_id)
            if flight_row:
                flight_label = flight_row.label
                event_row = flight_row.event or events.get(flight_row.event_id)
                if event_row is not None:
                    event_id = event_row.id
                    event_number = event_row.number
                    event_name = event_row.name
                    series_id = event_row.series_id
                    if event_row.series is not None:
                        series_name = event_row.series.name
                    elif event_row.series_id in series_map:
                        series_name = series_map[event_row.series_id].name

        context[entry.id] = {
            "series_id": series_id,
            "series_name": series_name,
            "event_id": event_id,
            "event_number": event_number,
            "event_name": event_name,
            "flight_label": flight_label,
        }
    return context


async def list_change_log(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    entity_type: str | None = None,
    change_type: ChangeType | None = None,
    actor_id: UUID | None = None,
    search: str | None = None,
    period: PeriodFilter = "7",
) -> PaginatedResponse[ChangeLogListItem]:
    base = select(ChangeLog)
    if entity_type:
        base = base.where(ChangeLog.entity_type == entity_type)
    if change_type is not None:
        base = base.where(ChangeLog.change_type == change_type)
    if actor_id is not None:
        base = base.where(ChangeLog.actor_id == actor_id)
    if period != "all":
        days = 7 if period == "7" else 30
        since = datetime.now(UTC) - timedelta(days=days)
        base = base.where(ChangeLog.created_at >= since)

    if search:
        pattern = f"%{search.strip()}%"
        series_ids = select(Series.id).where(Series.name.ilike(pattern))
        event_ids = select(Event.id).where(Event.name.ilike(pattern))
        event_ids_via_series = select(Event.id).where(Event.series_id.in_(series_ids))
        matched_events = event_ids.union(event_ids_via_series)
        flight_ids = select(Flight.id).where(Flight.event_id.in_(matched_events))
        base = base.where(
            or_(
                (ChangeLog.entity_type == "series") & ChangeLog.entity_id.in_(series_ids),
                (ChangeLog.entity_type == "event") & ChangeLog.entity_id.in_(matched_events),
                (ChangeLog.entity_type == "flight") & ChangeLog.entity_id.in_(flight_ids),
            )
        )

    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    entries = list(
        await session.scalars(
            base.order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc())
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
    )

    actor_ids = {entry.actor_id for entry in entries if entry.actor_id is not None}
    actors: dict[UUID, User] = {}
    if actor_ids:
        for user in await session.scalars(select(User).where(User.id.in_(actor_ids))):
            actors[user.id] = user

    delivery = await _delivery_counts(session, [entry.id for entry in entries])
    context = await _enrich_context(session, entries)

    items: list[ChangeLogListItem] = []
    for entry in entries:
        actor = actors.get(entry.actor_id) if entry.actor_id else None
        counts = delivery.get(entry.id, {"sent": 0, "failed": 0, "pending": 0})
        ctx = context.get(entry.id, {})
        items.append(
            ChangeLogListItem(
                id=entry.id,
                entity_type=entry.entity_type,
                entity_id=entry.entity_id,
                change_type=entry.change_type,
                old_value=entry.old_value,
                new_value=entry.new_value,
                actor_id=entry.actor_id,
                actor_email=actor.email if actor else None,
                actor_nickname=actor.nickname if actor else None,
                notified_at=entry.notified_at,
                created_at=entry.created_at,
                series_id=ctx.get("series_id"),  # type: ignore[arg-type]
                series_name=ctx.get("series_name"),  # type: ignore[arg-type]
                event_id=ctx.get("event_id"),  # type: ignore[arg-type]
                event_number=ctx.get("event_number"),  # type: ignore[arg-type]
                event_name=ctx.get("event_name"),  # type: ignore[arg-type]
                flight_label=ctx.get("flight_label"),  # type: ignore[arg-type]
                notifications_sent=counts["sent"],
                notifications_failed=counts["failed"],
                notifications_pending=counts["pending"],
                via_import=_via_import(entry.new_value),
            )
        )

    return PaginatedResponse(
        items=items,
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def list_event_changes(
    session: AsyncSession,
    event_id: UUID,
    *,
    limit: int = 50,
) -> list[ChangeLogListItem]:
    flight_ids = select(Flight.id).where(Flight.event_id == event_id)
    entries = list(
        await session.scalars(
            select(ChangeLog)
            .where(
                or_(
                    (ChangeLog.entity_type == "event") & (ChangeLog.entity_id == event_id),
                    (ChangeLog.entity_type == "flight") & ChangeLog.entity_id.in_(flight_ids),
                )
            )
            .order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc())
            .limit(limit)
        )
    )

    actor_ids = {entry.actor_id for entry in entries if entry.actor_id is not None}
    actors: dict[UUID, User] = {}
    if actor_ids:
        for user in await session.scalars(select(User).where(User.id.in_(actor_ids))):
            actors[user.id] = user

    delivery = await _delivery_counts(session, [entry.id for entry in entries])
    context = await _enrich_context(session, entries)

    items: list[ChangeLogListItem] = []
    for entry in entries:
        actor = actors.get(entry.actor_id) if entry.actor_id else None
        counts = delivery.get(entry.id, {"sent": 0, "failed": 0, "pending": 0})
        ctx = context.get(entry.id, {})
        items.append(
            ChangeLogListItem(
                id=entry.id,
                entity_type=entry.entity_type,
                entity_id=entry.entity_id,
                change_type=entry.change_type,
                old_value=entry.old_value,
                new_value=entry.new_value,
                actor_id=entry.actor_id,
                actor_email=actor.email if actor else None,
                actor_nickname=actor.nickname if actor else None,
                notified_at=entry.notified_at,
                created_at=entry.created_at,
                series_id=ctx.get("series_id"),  # type: ignore[arg-type]
                series_name=ctx.get("series_name"),  # type: ignore[arg-type]
                event_id=ctx.get("event_id"),  # type: ignore[arg-type]
                event_number=ctx.get("event_number"),  # type: ignore[arg-type]
                event_name=ctx.get("event_name"),  # type: ignore[arg-type]
                flight_label=ctx.get("flight_label"),  # type: ignore[arg-type]
                notifications_sent=counts["sent"],
                notifications_failed=counts["failed"],
                notifications_pending=counts["pending"],
                via_import=_via_import(entry.new_value),
            )
        )
    return items
