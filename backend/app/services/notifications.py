from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import User
from app.models.enums import BookmarkTarget, NotificationStatus, NotificationType
from app.models.notifications import Bookmark, NotificationQueue
from app.models.schedule import Event, Flight, Series
from app.schemas.notifications import (
    NotificationDiff,
    NotificationHistoryItem,
    NotificationListItem,
    NotificationListResponse,
)
from app.services.paths import event_canonical_path, series_canonical_path
from app.utils.timezone import venue_local_to_utc

SERIES_STARTING_OFFSET_DAYS = (7, 1)
SERIES_STARTING_LOCAL_HOUR = 10

_REMINDER_TYPES = (NotificationType.REMINDER, NotificationType.SERIES_STARTING)
_CHANGE_TYPES = (
    NotificationType.TIME_CHANGED,
    NotificationType.GUARANTEE_CHANGED,
    NotificationType.EVENT_CANCELLED,
    NotificationType.SERIES_CANCELLED,
    NotificationType.SCHEDULE_PUBLISHED,
)


async def cancel_pending_reminders(
    session: AsyncSession,
    *,
    bookmark_id: UUID,
) -> None:
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


async def cancel_all_pending_for_bookmark(
    session: AsyncSession,
    *,
    bookmark_id: UUID,
) -> None:
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


async def cancel_pending_series_starting(
    session: AsyncSession,
    *,
    bookmark_id: UUID,
) -> None:
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.type == NotificationType.SERIES_STARTING,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


async def schedule_flight_reminders(
    session: AsyncSession,
    *,
    bookmark: Bookmark,
    flight: Flight | None = None,
) -> list[NotificationQueue]:
    await cancel_pending_reminders(session, bookmark_id=bookmark.id)

    if bookmark.target_type != BookmarkTarget.FLIGHT:
        return []
    if not bookmark.reminder_offsets:
        return []

    if flight is None:
        flight = await session.scalar(
            select(Flight)
            .where(Flight.id == bookmark.target_id)
            .options(
                selectinload(Flight.event).selectinload(Event.series),
            )
        )
    if flight is None:
        return []

    event = flight.event
    series = event.series
    now = datetime.now(UTC)
    created: list[NotificationQueue] = []

    for offset in sorted(set(bookmark.reminder_offsets), reverse=True):
        scheduled_at = flight.start_at - timedelta(minutes=offset)
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=UTC)
        if scheduled_at <= now:
            continue

        label = f" ({flight.label})" if flight.label else ""
        title = f"Напоминание: {event.name}"
        body = f"{series.name}{label} стартует через {_humanize_offset(offset)}"
        row = NotificationQueue(
            user_id=bookmark.user_id,
            bookmark_id=bookmark.id,
            type=NotificationType.REMINDER,
            payload={
                "title": title,
                "body": body,
                "url": event_canonical_path(event, series_slug=series.slug),
                "type": NotificationType.REMINDER.value,
                "offset_minutes": offset,
                "event_id": str(event.id),
                "flight_id": str(flight.id),
            },
            scheduled_at=scheduled_at,
            status=NotificationStatus.PENDING,
            attempts=0,
        )
        session.add(row)
        created.append(row)

    await session.flush()
    return created


async def reschedule_reminders_for_flight(
    session: AsyncSession,
    *,
    flight_id: UUID,
) -> None:
    flight = await session.scalar(
        select(Flight)
        .where(Flight.id == flight_id)
        .options(
            selectinload(Flight.event).selectinload(Event.series),
        )
    )
    if flight is None:
        return
    bookmarks = list(
        await session.scalars(
            select(Bookmark).where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id == flight_id,
            )
        )
    )
    for bookmark in bookmarks:
        await schedule_flight_reminders(session, bookmark=bookmark, flight=flight)


async def cancel_pending_reminders_for_flight(
    session: AsyncSession,
    *,
    flight_id: UUID,
) -> None:
    bookmark_ids = list(
        await session.scalars(
            select(Bookmark.id).where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id == flight_id,
            )
        )
    )
    if not bookmark_ids:
        return
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id.in_(bookmark_ids),
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


async def cancel_pending_reminders_for_event(
    session: AsyncSession,
    *,
    event_id: UUID,
) -> None:
    flight_ids = list(await session.scalars(select(Flight.id).where(Flight.event_id == event_id)))
    if not flight_ids:
        return
    bookmark_ids = list(
        await session.scalars(
            select(Bookmark.id).where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id.in_(flight_ids),
            )
        )
    )
    if not bookmark_ids:
        return
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id.in_(bookmark_ids),
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


def _series_starting_local_datetimes(starts_on: date, venue_timezone: str) -> list[datetime]:
    zone = ZoneInfo(venue_timezone)
    result: list[datetime] = []
    for days_before in SERIES_STARTING_OFFSET_DAYS:
        local_day = starts_on - timedelta(days=days_before)
        local_dt = datetime.combine(
            local_day,
            time(hour=SERIES_STARTING_LOCAL_HOUR, minute=0),
            tzinfo=zone,
        )
        result.append(local_dt)
    return result


async def schedule_series_starting(
    session: AsyncSession,
    *,
    bookmark: Bookmark,
    series: Series | None = None,
) -> list[NotificationQueue]:
    await cancel_pending_series_starting(session, bookmark_id=bookmark.id)

    if bookmark.target_type != BookmarkTarget.SERIES:
        return []

    if series is None:
        series = await session.scalar(
            select(Series)
            .where(Series.id == bookmark.target_id)
            .options(selectinload(Series.venue))
        )
    if series is None:
        return []

    now = datetime.now(UTC)
    created: list[NotificationQueue] = []
    for local_dt in _series_starting_local_datetimes(series.starts_on, series.venue.timezone):
        scheduled_at = venue_local_to_utc(local_dt, series.venue.timezone)
        if scheduled_at <= now:
            continue
        days_left = (series.starts_on - local_dt.date()).days
        if days_left == 1:
            body = f"Серия «{series.name}» стартует завтра"
        else:
            body = f"Серия «{series.name}» стартует через {days_left} дн."
        row = NotificationQueue(
            user_id=bookmark.user_id,
            bookmark_id=bookmark.id,
            type=NotificationType.SERIES_STARTING,
            payload={
                "title": "Скоро старт серии",
                "body": body,
                "url": series_canonical_path(series),
                "type": NotificationType.SERIES_STARTING.value,
                "series_id": str(series.id),
                "days_before": days_left,
            },
            scheduled_at=scheduled_at,
            status=NotificationStatus.PENDING,
            attempts=0,
        )
        session.add(row)
        created.append(row)

    await session.flush()
    return created


async def reschedule_series_starting_for_series(
    session: AsyncSession,
    *,
    series_id: UUID,
) -> None:
    series = await session.scalar(
        select(Series).where(Series.id == series_id).options(selectinload(Series.venue))
    )
    if series is None:
        return
    bookmarks = list(
        await session.scalars(
            select(Bookmark).where(
                Bookmark.target_type == BookmarkTarget.SERIES,
                Bookmark.target_id == series_id,
            )
        )
    )
    for bookmark in bookmarks:
        await schedule_series_starting(session, bookmark=bookmark, series=series)


async def cancel_pending_series_starting_for_series(
    session: AsyncSession,
    *,
    series_id: UUID,
) -> None:
    bookmark_ids = list(
        await session.scalars(
            select(Bookmark.id).where(
                Bookmark.target_type == BookmarkTarget.SERIES,
                Bookmark.target_id == series_id,
            )
        )
    )
    if not bookmark_ids:
        return
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id.in_(bookmark_ids),
            NotificationQueue.type == NotificationType.SERIES_STARTING,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


async def cancel_pending_reminders_for_series(
    session: AsyncSession,
    *,
    series_id: UUID,
) -> None:
    event_ids = list(await session.scalars(select(Event.id).where(Event.series_id == series_id)))
    if not event_ids:
        return
    flight_ids = list(
        await session.scalars(select(Flight.id).where(Flight.event_id.in_(event_ids)))
    )
    if not flight_ids:
        return
    bookmark_ids = list(
        await session.scalars(
            select(Bookmark.id).where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id.in_(flight_ids),
            )
        )
    )
    if not bookmark_ids:
        return
    await session.execute(
        delete(NotificationQueue).where(
            NotificationQueue.bookmark_id.in_(bookmark_ids),
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )


async def list_notification_history(
    session: AsyncSession,
    user: User,
    *,
    days: int = 30,
) -> list[NotificationHistoryItem]:
    clamped_days = max(1, min(90, days))
    cutoff = datetime.now(UTC) - timedelta(days=clamped_days)
    rows = await session.scalars(
        select(NotificationQueue)
        .where(
            NotificationQueue.user_id == user.id,
            NotificationQueue.status == NotificationStatus.SENT,
            NotificationQueue.sent_at.is_not(None),
            NotificationQueue.sent_at >= cutoff,
        )
        .order_by(NotificationQueue.sent_at.desc())
    )
    items: list[NotificationHistoryItem] = []
    for row in rows:
        payload = row.payload if isinstance(row.payload, dict) else {}
        items.append(
            NotificationHistoryItem(
                id=row.id,
                type=row.type,
                title=str(payload.get("title") or ""),
                body=str(payload.get("body") or ""),
                url=str(payload.get("url") or ""),
                status=row.status,
                scheduled_at=row.scheduled_at,
                sent_at=row.sent_at,
                created_at=row.created_at,
            )
        )
    return items


def _format_money(value: object) -> str | None:
    if value is None:
        return None
    text = str(value)
    try:
        from decimal import Decimal

        amount = Decimal(text)
        if amount == amount.to_integral_value():
            whole = format(amount.quantize(Decimal("1")), "f")
            return f"{_group_thousands(whole)} ₽"
        raw = format(amount, "f")
        return f"{_with_spaces(raw)} ₽"
    except Exception:
        return text


def _with_spaces(raw: str) -> str:
    if "." in raw:
        whole, frac = raw.split(".", 1)
        return f"{_group_thousands(whole)}.{frac}"
    return _group_thousands(raw)


def _group_thousands(whole: str) -> str:
    negative = whole.startswith("-")
    digits = whole[1:] if negative else whole
    parts: list[str] = []
    while digits:
        parts.append(digits[-3:])
        digits = digits[:-3]
    grouped = " ".join(reversed(parts))
    return f"-{grouped}" if negative else grouped


def _format_iso_time(value: object) -> str | None:
    if value is None:
        return None
    text = str(value)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC).strftime("%H:%M")
    except ValueError:
        if len(text) >= 5 and text[2] == ":":
            return text[:5]
        return text


def _format_date_value(value: object) -> str | None:
    if value is None:
        return None
    text = str(value)
    try:
        d = date.fromisoformat(text[:10])
        return d.strftime("%d.%m.%Y")
    except ValueError:
        return text


def _diff_from_payload(payload: dict[str, object]) -> NotificationDiff | None:
    if "old_guarantee" in payload or "new_guarantee" in payload:
        old = _format_money(payload.get("old_guarantee"))
        new = _format_money(payload.get("new_guarantee"))
        if old and new:
            return NotificationDiff(old=old, new=new)

    if "old_start_at" in payload or "new_start_at" in payload:
        old = _format_iso_time(payload.get("old_start_at"))
        new = _format_iso_time(payload.get("new_start_at"))
        if old and new:
            return NotificationDiff(old=old, new=new)

    if "old_starts_on" in payload or "new_starts_on" in payload:
        old = _format_date_value(payload.get("old_starts_on"))
        new = _format_date_value(payload.get("new_starts_on"))
        if old and new:
            return NotificationDiff(old=old, new=new)

    return None


def _list_item_from_row(row: NotificationQueue) -> NotificationListItem:
    payload = row.payload if isinstance(row.payload, dict) else {}
    return NotificationListItem(
        id=row.id,
        type=row.type,
        title=str(payload.get("title") or ""),
        body=str(payload.get("body") or ""),
        url=str(payload.get("url") or ""),
        sent_at=row.sent_at,
        read_at=row.read_at,
        is_unread=row.read_at is None,
        diff=_diff_from_payload(payload),
    )


async def list_notifications(
    session: AsyncSession,
    user: User,
    *,
    type_filter: str | None = None,
    unread_only: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> NotificationListResponse:
    clamped_limit = max(1, min(50, limit))
    clamped_offset = max(0, offset)

    conditions = [
        NotificationQueue.user_id == user.id,
        NotificationQueue.status == NotificationStatus.SENT,
        NotificationQueue.sent_at.is_not(None),
    ]
    if unread_only:
        conditions.append(NotificationQueue.read_at.is_(None))
    if type_filter == "reminders":
        conditions.append(NotificationQueue.type.in_(_REMINDER_TYPES))
    elif type_filter == "changes":
        conditions.append(NotificationQueue.type.in_(_CHANGE_TYPES))

    total = int(
        await session.scalar(select(func.count()).select_from(NotificationQueue).where(*conditions))
        or 0
    )
    rows = list(
        await session.scalars(
            select(NotificationQueue)
            .where(*conditions)
            .order_by(NotificationQueue.sent_at.desc(), NotificationQueue.id.desc())
            .limit(clamped_limit)
            .offset(clamped_offset)
        )
    )
    items = [_list_item_from_row(row) for row in rows]
    return NotificationListResponse(
        items=items,
        total=total,
        limit=clamped_limit,
        offset=clamped_offset,
        has_more=clamped_offset + len(items) < total,
    )


async def mark_notifications_read(
    session: AsyncSession,
    user: User,
    *,
    ids: list[UUID] | None = None,
    mark_all: bool = False,
) -> int:
    now = datetime.now(UTC)
    conditions = [
        NotificationQueue.user_id == user.id,
        NotificationQueue.status == NotificationStatus.SENT,
        NotificationQueue.read_at.is_(None),
    ]
    if mark_all:
        pass
    elif ids:
        conditions.append(NotificationQueue.id.in_(ids))
    else:
        return 0

    result = await session.execute(
        update(NotificationQueue)
        .where(*conditions)
        .values(read_at=now)
        .returning(NotificationQueue.id)
    )
    marked = len(result.all())
    await session.flush()
    return marked


async def unread_notifications_count(session: AsyncSession, user: User) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(NotificationQueue)
            .where(
                NotificationQueue.user_id == user.id,
                NotificationQueue.status == NotificationStatus.SENT,
                NotificationQueue.read_at.is_(None),
            )
        )
        or 0
    )


def _humanize_offset(minutes: int) -> str:
    mapping = {
        15: "15 минут",
        60: "1 час",
        120: "2 часа",
        360: "6 часов",
        1440: "24 часа",
        2880: "48 часов",
    }
    return mapping.get(minutes, f"{minutes} минут")


async def load_series(session: AsyncSession, series_id: UUID) -> Series | None:
    series = await session.scalar(select(Series).where(Series.id == series_id))
    return series if isinstance(series, Series) else None


async def load_flight(session: AsyncSession, flight_id: UUID) -> Flight | None:
    flight = await session.scalar(
        select(Flight)
        .where(Flight.id == flight_id)
        .options(selectinload(Flight.event).selectinload(Event.series))
    )
    return flight if isinstance(flight, Flight) else None
