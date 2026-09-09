"""Operational admin dashboard aggregates."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.system_accounts import DEMO_HANDS_USER_ID
from app.models.auth import User
from app.models.enums import (
    BookmarkTarget,
    ChangeType,
    EventStatus,
    ImportStatus,
    NotificationStatus,
    SeriesStatus,
)
from app.models.imports import ImportJob
from app.models.notifications import Bookmark, NotificationQueue
from app.models.schedule import ChangeLog, Event, Flight, Series
from app.schemas.admin_dashboard import (
    AdminDashboardResponse,
    DashboardAlertCount,
    DashboardAlertItem,
    DashboardAttention,
    DashboardKpis,
    DashboardNav,
    DashboardPushFailedAlert,
    DashboardRecentChange,
    DashboardUpcomingItem,
    KpiActiveSeries,
    KpiEventsWeek,
    KpiPush24h,
    KpiWithDelta,
)
from app.services.admin_change_log import _via_import

_ACTIVE_STATUSES = (
    SeriesStatus.ANNOUNCED,
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
)
_ALERT_ITEMS_LIMIT = 5
_UPCOMING_LIMIT = 5
_RECENT_CHANGES_LIMIT = 4


def _stale_series_clause(today: date) -> ColumnElement[bool]:
    overdue = and_(
        Series.ends_on < today,
        Series.status.not_in((SeriesStatus.FINISHED, SeriesStatus.CANCELLED)),
    )
    should_run = and_(
        Series.starts_on <= today,
        Series.ends_on >= today,
        Series.status.not_in((SeriesStatus.RUNNING, SeriesStatus.CANCELLED)),
    )
    return or_(overdue, should_run)


def _local_hhmm(start_at: datetime, timezone_name: str) -> str:
    try:
        local = start_at.astimezone(ZoneInfo(timezone_name))
    except Exception:
        local = start_at.astimezone(UTC)
    return f"{local.hour:02d}:{local.minute:02d}"


def _series_start_at(series: Series) -> datetime:
    tz_name = series.venue.timezone if series.venue else "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    return datetime.combine(series.starts_on, time.min, tzinfo=tz).astimezone(UTC)


def _flight_title(event: Event, flight: Flight) -> str:
    number = f"#{event.number} " if event.number is not None else ""
    label = f" · {flight.label}" if flight.label else ""
    return f"{number}{event.name}{label}".strip()


def _change_title(entry: ChangeLog, *, series_name: str | None, event_name: str | None) -> str:
    if _via_import(entry.new_value):
        created = entry.new_value.get("events_created") if entry.new_value else None
        if isinstance(created, int):
            return f"Импорт расписания · {created} турниров"
        return "Импорт расписания"
    name = event_name or series_name
    if entry.change_type == ChangeType.CANCELLED:
        return f"{name} отменён" if name else "Отмена"
    if entry.change_type == ChangeType.SCHEDULE_PUBLISHED:
        return f"Опубликована сетка {series_name}" if series_name else "Опубликована сетка"
    if entry.change_type == ChangeType.CREATED:
        return f"Добавлен {name}" if name else "Создание"
    if name and entry.old_value and entry.new_value:
        if "start_at" in entry.old_value or "start_at" in entry.new_value:
            return f"{name} перенесён"
        if "guarantee" in entry.old_value or "guarantee" in entry.new_value:
            return f"{name} · гарантия"
    return f"{name} изменён" if name else f"Обновление · {entry.entity_type}"


def _format_scalar(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        if len(value) >= 16 and value[10:11] == "T":
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return f"{dt.hour:02d}:{dt.minute:02d}"
            except ValueError:
                return value
        return value
    if isinstance(value, (int, float)):
        return str(value)
    return None


def _change_detail(
    entry: ChangeLog,
    *,
    series_name: str | None,
    notifications_sent: int,
) -> str | None:
    bits: list[str] = []
    if entry.old_value and entry.new_value:
        for key in ("start_at", "guarantee", "buyin", "status"):
            if key in entry.old_value or key in entry.new_value:
                old_t = _format_scalar(entry.old_value.get(key))
                new_t = _format_scalar(entry.new_value.get(key))
                if old_t or new_t:
                    bits.append(f"{old_t or '—'} → {new_t or '—'}")
                break
    if series_name and entry.change_type == ChangeType.CREATED:
        bits.append(series_name)
    if notifications_sent > 0:
        bits.append(f"{notifications_sent} уведомлений")
    return " · ".join(bits) if bits else None


async def get_dashboard(session: AsyncSession) -> AdminDashboardResponse:
    now = datetime.now(UTC)
    today = now.date()
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)
    week_ahead = now + timedelta(days=7)

    # --- attention: imports in review ---
    review_jobs = (
        await session.scalars(
            select(ImportJob)
            .options(selectinload(ImportJob.series))
            .where(ImportJob.status == ImportStatus.REVIEW)
            .order_by(ImportJob.created_at.desc())
            .limit(_ALERT_ITEMS_LIMIT)
        )
    ).all()
    review_count = await session.scalar(
        select(func.count()).select_from(ImportJob).where(ImportJob.status == ImportStatus.REVIEW)
    )
    imports_review = DashboardAlertCount(
        count=int(review_count or 0),
        items=[
            DashboardAlertItem(
                id=job.id,
                label=(job.series.name if job.series is not None else job.original_filename),
                series_id=job.series_id,
            )
            for job in review_jobs
        ],
    )

    # --- series without schedule ---
    events_count_sq = (
        select(func.count(Event.id))
        .where(Event.series_id == Series.id)
        .correlate(Series)
        .scalar_subquery()
    )
    empty_base = select(Series).where(
        Series.status == SeriesStatus.ANNOUNCED,
        events_count_sq == 0,
    )
    empty_count = await session.scalar(select(func.count()).select_from(empty_base.subquery()))
    empty_series = (
        await session.scalars(
            empty_base.order_by(Series.starts_on.asc(), Series.name.asc()).limit(_ALERT_ITEMS_LIMIT)
        )
    ).all()
    series_without_schedule = DashboardAlertCount(
        count=int(empty_count or 0),
        items=[
            DashboardAlertItem(id=item.id, label=item.name, series_id=item.id)
            for item in empty_series
        ],
    )

    # --- push failed 24h ---
    push_failed = await session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.status == NotificationStatus.FAILED,
            NotificationQueue.created_at >= day_ago,
        )
    )
    push_failed_24h = DashboardPushFailedAlert(count=int(push_failed or 0))

    # --- stale series ---
    stale_base = select(Series).where(_stale_series_clause(today))
    stale_count = await session.scalar(select(func.count()).select_from(stale_base.subquery()))
    stale_items = (
        await session.scalars(
            stale_base.order_by(Series.ends_on.asc(), Series.name.asc()).limit(_ALERT_ITEMS_LIMIT)
        )
    ).all()
    stale_series = DashboardAlertCount(
        count=int(stale_count or 0),
        items=[
            DashboardAlertItem(id=item.id, label=item.name, series_id=item.id)
            for item in stale_items
        ],
    )

    attention = DashboardAttention(
        imports_review=imports_review,
        series_without_schedule=series_without_schedule,
        push_failed_24h=push_failed_24h,
        stale_series=stale_series,
    )

    # --- KPIs ---
    active_value = await session.scalar(
        select(func.count()).select_from(Series).where(Series.status.in_(_ACTIVE_STATUSES))
    )
    running_now = await session.scalar(
        select(func.count()).select_from(Series).where(Series.status == SeriesStatus.RUNNING)
    )

    events_in_window = (
        select(Event.id, Event.series_id)
        .join(Flight, Flight.event_id == Event.id)
        .where(
            Flight.start_at >= now,
            Flight.start_at < week_ahead,
            Event.status != EventStatus.CANCELLED,
        )
        .distinct()
        .subquery()
    )
    events_week_value = await session.scalar(select(func.count()).select_from(events_in_window))
    events_week_series = await session.scalar(
        select(func.count(func.distinct(events_in_window.c.series_id)))
    )

    users_total = await session.scalar(
        select(func.count()).select_from(User).where(User.id != DEMO_HANDS_USER_ID)
    )
    users_delta = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(User.id != DEMO_HANDS_USER_ID, User.created_at >= week_ago)
    )
    bookmarks_total = await session.scalar(select(func.count()).select_from(Bookmark))
    bookmarks_delta = await session.scalar(
        select(func.count()).select_from(Bookmark).where(Bookmark.created_at >= week_ago)
    )
    push_sent = await session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.status == NotificationStatus.SENT,
            NotificationQueue.sent_at.is_not(None),
            NotificationQueue.sent_at >= day_ago,
        )
    )

    kpis = DashboardKpis(
        active_series=KpiActiveSeries(
            value=int(active_value or 0),
            running_now=int(running_now or 0),
        ),
        events_next_7d=KpiEventsWeek(
            value=int(events_week_value or 0),
            series_count=int(events_week_series or 0),
        ),
        users=KpiWithDelta(value=int(users_total or 0), delta_7d=int(users_delta or 0)),
        bookmarks=KpiWithDelta(
            value=int(bookmarks_total or 0),
            delta_7d=int(bookmarks_delta or 0),
        ),
        push_24h=KpiPush24h(sent=int(push_sent or 0), failed=int(push_failed or 0)),
    )

    # --- upcoming ---
    flights = (
        await session.scalars(
            select(Flight)
            .options(
                selectinload(Flight.event).selectinload(Event.series).selectinload(Series.venue)
            )
            .join(Event, Event.id == Flight.event_id)
            .where(
                Flight.start_at >= now,
                Event.status != EventStatus.CANCELLED,
            )
            .order_by(Flight.start_at.asc())
            .limit(20)
        )
    ).all()
    series_upcoming = (
        await session.scalars(
            select(Series)
            .options(selectinload(Series.venue))
            .where(
                Series.starts_on >= today,
                Series.status.not_in((SeriesStatus.FINISHED, SeriesStatus.CANCELLED)),
            )
            .order_by(Series.starts_on.asc())
            .limit(20)
        )
    ).all()

    flight_ids = [f.id for f in flights]
    series_ids_upcoming = [s.id for s in series_upcoming]
    sub_counts: dict[tuple[str, UUID], int] = {}
    if flight_ids:
        for target_id, cnt in await session.execute(
            select(Bookmark.target_id, func.count())
            .where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id.in_(flight_ids),
            )
            .group_by(Bookmark.target_id)
        ):
            sub_counts[("flight", target_id)] = int(cnt)
    if series_ids_upcoming:
        for target_id, cnt in await session.execute(
            select(Bookmark.target_id, func.count())
            .where(
                Bookmark.target_type == BookmarkTarget.SERIES,
                Bookmark.target_id.in_(series_ids_upcoming),
            )
            .group_by(Bookmark.target_id)
        ):
            sub_counts[("series", target_id)] = int(cnt)

    upcoming_candidates: list[DashboardUpcomingItem] = []
    for flight in flights:
        event = flight.event
        series = event.series
        tz = series.venue.timezone if series.venue else "UTC"
        local = _local_hhmm(flight.start_at, tz)
        upcoming_candidates.append(
            DashboardUpcomingItem(
                kind="flight",
                start_at=flight.start_at,
                local_time=local,
                title=_flight_title(event, flight),
                subtitle=f"{series.name} · {local} местное",
                event_id=event.id,
                series_id=series.id,
                subscribers=sub_counts.get(("flight", flight.id), 0),
            )
        )
    for series in series_upcoming:
        venue_name = series.venue.name if series.venue else ""
        city = series.venue.city if series.venue else ""
        place = ", ".join(part for part in (venue_name, city) if part)
        upcoming_candidates.append(
            DashboardUpcomingItem(
                kind="series",
                start_at=_series_start_at(series),
                local_time=None,
                title=series.name,
                subtitle=f"старт серии · {place}" if place else "старт серии",
                event_id=None,
                series_id=series.id,
                subscribers=sub_counts.get(("series", series.id), 0),
            )
        )
    upcoming_candidates.sort(key=lambda item: item.start_at)
    upcoming = upcoming_candidates[:_UPCOMING_LIMIT]

    # --- recent changes ---
    entries = (
        await session.scalars(
            select(ChangeLog).order_by(ChangeLog.created_at.desc()).limit(_RECENT_CHANGES_LIMIT)
        )
    ).all()
    series_map: dict[UUID, Series] = {}
    event_map: dict[UUID, Event] = {}
    series_ids = {e.entity_id for e in entries if e.entity_type == "series"}
    event_ids = {e.entity_id for e in entries if e.entity_type == "event"}
    flight_ids_cl = {e.entity_id for e in entries if e.entity_type == "flight"}
    if series_ids:
        for series in await session.scalars(select(Series).where(Series.id.in_(series_ids))):
            series_map[series.id] = series
    if event_ids:
        for event in await session.scalars(
            select(Event).options(selectinload(Event.series)).where(Event.id.in_(event_ids))
        ):
            event_map[event.id] = event
    flight_to_event: dict[UUID, Event] = {}
    if flight_ids_cl:
        for flight in await session.scalars(
            select(Flight)
            .options(selectinload(Flight.event).selectinload(Event.series))
            .where(Flight.id.in_(flight_ids_cl))
        ):
            flight_to_event[flight.id] = flight.event

    delivery_sent: dict[UUID, int] = {}
    if entries:
        for change_id, cnt in await session.execute(
            select(NotificationQueue.change_log_id, func.count())
            .where(
                NotificationQueue.change_log_id.in_([e.id for e in entries]),
                NotificationQueue.status == NotificationStatus.SENT,
            )
            .group_by(NotificationQueue.change_log_id)
        ):
            if change_id is not None:
                delivery_sent[change_id] = int(cnt)

    recent_changes: list[DashboardRecentChange] = []
    for entry in entries:
        series_name: str | None = None
        event_name: str | None = None
        series_id: UUID | None = None
        event_id: UUID | None = None
        if entry.entity_type == "series":
            series_row = series_map.get(entry.entity_id)
            series_name = series_row.name if series_row else None
            series_id = entry.entity_id
        elif entry.entity_type == "event":
            event_row = event_map.get(entry.entity_id)
            if event_row:
                event_name = event_row.name
                event_id = event_row.id
                series_id = event_row.series_id
                series_name = event_row.series.name if event_row.series else None
        elif entry.entity_type == "flight":
            event_row = flight_to_event.get(entry.entity_id)
            if event_row:
                event_name = event_row.name
                event_id = event_row.id
                series_id = event_row.series_id
                series_name = event_row.series.name if event_row.series else None
        sent = delivery_sent.get(entry.id, 0)
        recent_changes.append(
            DashboardRecentChange(
                id=entry.id,
                change_type=entry.change_type,
                via_import=_via_import(entry.new_value),
                title=_change_title(entry, series_name=series_name, event_name=event_name),
                detail=_change_detail(entry, series_name=series_name, notifications_sent=sent),
                created_at=entry.created_at,
                series_id=series_id,
                event_id=event_id,
            )
        )

    return AdminDashboardResponse(
        generated_at=now,
        attention=attention,
        kpis=kpis,
        upcoming=upcoming,
        recent_changes=recent_changes,
        nav=DashboardNav(imports_review_count=imports_review.count),
    )
