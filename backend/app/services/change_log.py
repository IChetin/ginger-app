from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.enums import ChangeType, EventStatus, SeriesStatus
from app.models.schedule import BlindLevel, ChangeLog, Event, Flight, Series

EntityType = Literal["series", "event", "flight"]

PUBLISHED_SERIES_STATUSES = frozenset(
    {
        SeriesStatus.SCHEDULE_PUBLISHED,
        SeriesStatus.RUNNING,
        SeriesStatus.FINISHED,
        SeriesStatus.CANCELLED,
    }
)


def is_series_published(status: SeriesStatus) -> bool:
    return status in PUBLISHED_SERIES_STATUSES


def json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, str | int | float | bool):
        return value
    return str(value)


def changed_fields(
    old: dict[str, Any],
    new: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    keys = set(old) | set(new)
    old_diff: dict[str, Any] = {}
    new_diff: dict[str, Any] = {}
    for key in keys:
        old_value = old.get(key)
        new_value = new.get(key)
        if old_value != new_value:
            if key in old:
                old_diff[key] = old_value
            if key in new:
                new_diff[key] = new_value
    if not old_diff and not new_diff:
        return None, None
    return (old_diff or None), (new_diff or None)


def series_snapshot(series: Series) -> dict[str, Any]:
    snapshot = json_safe(
        {
            "organizer_id": series.organizer_id,
            "venue_id": series.venue_id,
            "name": series.name,
            "slug": series.slug,
            "starts_on": series.starts_on,
            "ends_on": series.ends_on,
            "status": series.status,
            "guarantee": series.guarantee,
            "guarantee_currency_code": series.guarantee_currency_code,
            "poster_url": series.poster_url,
            "links": dict(series.links),
            "description": series.description,
        }
    )
    assert isinstance(snapshot, dict)
    return snapshot


def event_snapshot(event: Event) -> dict[str, Any]:
    snapshot = json_safe(
        {
            "series_id": event.series_id,
            "number": event.number,
            "name": event.name,
            "slug": event.slug,
            "buyin": event.buyin,
            "buyin_bounty": event.buyin_bounty,
            "currency_code": event.currency_code,
            "guarantee": event.guarantee,
            "game_type": event.game_type,
            "tags": list(event.tags),
            "start_stack": event.start_stack,
            "start_blinds": event.start_blinds,
            "reentry_count": event.reentry_count,
            "reentry_unlimited": event.reentry_unlimited,
            "late_reg_level": event.late_reg_level,
            "day_end_note": event.day_end_note,
            "status": event.status,
            "notes": event.notes,
        }
    )
    assert isinstance(snapshot, dict)
    return snapshot


def flight_snapshot(flight: Flight) -> dict[str, Any]:
    snapshot = json_safe(
        {
            "event_id": flight.event_id,
            "label": flight.label,
            "start_at": flight.start_at,
            "level_minutes": flight.level_minutes,
        }
    )
    assert isinstance(snapshot, dict)
    return snapshot


def blind_levels_snapshot(levels: list[BlindLevel]) -> list[dict[str, Any]]:
    ordered = sorted(
        levels, key=lambda item: (item.structure_set_label or "default", item.level_no)
    )
    return [
        json_safe(
            {
                "id": level.id,
                "structure_set_label": level.structure_set_label or "default",
                "level_no": level.level_no,
                "sb": level.sb,
                "bb": level.bb,
                "ante": level.ante,
                "minutes": level.minutes,
                "is_break": level.is_break,
                "is_late_reg_end": level.is_late_reg_end,
            }
        )
        for level in ordered
    ]


async def append_change(
    session: AsyncSession,
    *,
    entity_type: EntityType,
    entity_id: UUID,
    change_type: ChangeType,
    actor_id: UUID,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
) -> ChangeLog:
    if actor_id is None:
        raise AppError("validation_error", "actor_id is required for change_log", 400)

    entry = ChangeLog(
        entity_type=entity_type,
        entity_id=entity_id,
        change_type=change_type,
        old_value=json_safe(old_value) if old_value is not None else None,
        new_value=json_safe(new_value) if new_value is not None else None,
        actor_id=actor_id,
        notified_at=None,
    )
    session.add(entry)
    return entry


def resolve_series_change_type(
    *,
    old_status: SeriesStatus,
    new_status: SeriesStatus,
) -> ChangeType | None:
    if new_status == SeriesStatus.CANCELLED and old_status != SeriesStatus.CANCELLED:
        return ChangeType.CANCELLED
    if new_status == SeriesStatus.SCHEDULE_PUBLISHED and old_status == SeriesStatus.ANNOUNCED:
        return ChangeType.SCHEDULE_PUBLISHED
    if is_series_published(old_status) or is_series_published(new_status):
        return ChangeType.UPDATED
    return None


async def log_series_update(
    session: AsyncSession,
    *,
    series: Series,
    old_snapshot: dict[str, Any],
    actor_id: UUID,
) -> ChangeLog | None:
    new_snapshot = series_snapshot(series)
    old_diff, new_diff = changed_fields(old_snapshot, new_snapshot)
    if old_diff is None and new_diff is None:
        return None

    old_status = SeriesStatus(old_snapshot["status"])
    change_type = resolve_series_change_type(old_status=old_status, new_status=series.status)
    if change_type is None:
        return None

    return await append_change(
        session,
        entity_type="series",
        entity_id=series.id,
        change_type=change_type,
        actor_id=actor_id,
        old_value=old_diff,
        new_value=new_diff,
    )


async def log_event_create(
    session: AsyncSession,
    *,
    event: Event,
    series_status: SeriesStatus,
    actor_id: UUID,
) -> ChangeLog | None:
    if not is_series_published(series_status):
        return None
    return await append_change(
        session,
        entity_type="event",
        entity_id=event.id,
        change_type=ChangeType.CREATED,
        actor_id=actor_id,
        old_value=None,
        new_value=event_snapshot(event),
    )


async def log_event_update(
    session: AsyncSession,
    *,
    event: Event,
    old_snapshot: dict[str, Any],
    series_status: SeriesStatus,
    actor_id: UUID,
) -> ChangeLog | None:
    if not is_series_published(series_status):
        return None

    new_snapshot = event_snapshot(event)
    old_diff, new_diff = changed_fields(old_snapshot, new_snapshot)
    if old_diff is None and new_diff is None:
        return None

    if (
        event.status == EventStatus.CANCELLED
        and old_snapshot.get("status") != EventStatus.CANCELLED.value
    ):
        change_type = ChangeType.CANCELLED
    else:
        change_type = ChangeType.UPDATED

    return await append_change(
        session,
        entity_type="event",
        entity_id=event.id,
        change_type=change_type,
        actor_id=actor_id,
        old_value=old_diff,
        new_value=new_diff,
    )


async def log_flight_create(
    session: AsyncSession,
    *,
    flight: Flight,
    series_status: SeriesStatus,
    actor_id: UUID,
) -> ChangeLog | None:
    if not is_series_published(series_status):
        return None
    return await append_change(
        session,
        entity_type="flight",
        entity_id=flight.id,
        change_type=ChangeType.CREATED,
        actor_id=actor_id,
        old_value=None,
        new_value=flight_snapshot(flight),
    )


async def log_flight_update(
    session: AsyncSession,
    *,
    flight: Flight,
    old_snapshot: dict[str, Any],
    series_status: SeriesStatus,
    actor_id: UUID,
) -> ChangeLog | None:
    if not is_series_published(series_status):
        return None
    new_snapshot = flight_snapshot(flight)
    old_diff, new_diff = changed_fields(old_snapshot, new_snapshot)
    if old_diff is None and new_diff is None:
        return None
    return await append_change(
        session,
        entity_type="flight",
        entity_id=flight.id,
        change_type=ChangeType.UPDATED,
        actor_id=actor_id,
        old_value=old_diff,
        new_value=new_diff,
    )


async def log_blind_levels_update(
    session: AsyncSession,
    *,
    event_id: UUID,
    old_levels: list[dict[str, Any]],
    new_levels: list[dict[str, Any]],
    series_status: SeriesStatus,
    actor_id: UUID,
) -> ChangeLog | None:
    if not is_series_published(series_status):
        return None
    if old_levels == new_levels:
        return None
    return await append_change(
        session,
        entity_type="event",
        entity_id=event_id,
        change_type=ChangeType.UPDATED,
        actor_id=actor_id,
        old_value={"blind_levels": old_levels},
        new_value={"blind_levels": new_levels},
    )
