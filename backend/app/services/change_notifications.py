from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    BookmarkTarget,
    EventStatus,
    NotificationStatus,
    NotificationType,
    SeriesStatus,
)
from app.models.notifications import Bookmark, NotificationQueue
from app.models.schedule import ChangeLog, Event, Flight, Series
from app.schemas.notifications import FieldDiff

TargetKind = Literal[
    "series_bookmarks",
    "event_flight_bookmarks",
    "flight_bookmarks",
    "flights_bookmarks",
]


@dataclass(frozen=True)
class TargetSelector:
    kind: TargetKind
    series_id: UUID | None = None
    event_id: UUID | None = None
    flight_id: UUID | None = None
    flight_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlannedNotification:
    type: NotificationType
    title: str
    body: str
    url: str
    target: TargetSelector
    extra: dict[str, object] = field(default_factory=dict)

    def payload_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "title": self.title,
            "body": self.body,
            "url": self.url,
            "type": self.type.value,
        }
        payload.update(self.extra)
        return payload


def build_field_diffs(
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
    *,
    fields: list[str] | None = None,
) -> list[FieldDiff]:
    keys = fields if fields is not None else sorted(set(old_snapshot) | set(new_snapshot))
    diffs: list[FieldDiff] = []
    for key in keys:
        old_value = old_snapshot.get(key)
        new_value = new_snapshot.get(key)
        if old_value != new_value:
            diffs.append(FieldDiff(field=key, old_value=old_value, new_value=new_value))
    return diffs


from app.services.paths import event_canonical_path, series_canonical_path


def payload_schedule_published(*, series: Series) -> dict[str, object]:
    return {
        "title": "Опубликовано расписание",
        "body": f"Расписание серии «{series.name}» доступно",
        "url": series_canonical_path(series),
        "type": NotificationType.SCHEDULE_PUBLISHED.value,
        "series_id": str(series.id),
    }


def payload_series_time_changed(
    *,
    series: Series,
    old_starts_on: str | None,
    new_starts_on: str | None,
    old_ends_on: str | None,
    new_ends_on: str | None,
) -> dict[str, object]:
    return {
        "title": "Изменились даты серии",
        "body": f"У серии «{series.name}» обновлены даты проведения",
        "url": series_canonical_path(series),
        "type": NotificationType.TIME_CHANGED.value,
        "series_id": str(series.id),
        "old_starts_on": old_starts_on,
        "new_starts_on": new_starts_on,
        "old_ends_on": old_ends_on,
        "new_ends_on": new_ends_on,
    }


def payload_series_cancelled(*, series: Series) -> dict[str, object]:
    return {
        "title": "Серия отменена",
        "body": f"Серия «{series.name}» отменена",
        "url": series_canonical_path(series),
        "type": NotificationType.SERIES_CANCELLED.value,
        "series_id": str(series.id),
    }


def payload_event_cancelled(*, event: Event) -> dict[str, object]:
    return {
        "title": "Турнир отменён",
        "body": f"Турнир «{event.name}» отменён",
        "url": event_canonical_path(event),
        "type": NotificationType.EVENT_CANCELLED.value,
        "event_id": str(event.id),
        "series_id": str(event.series_id),
    }


def payload_guarantee_changed(
    *,
    event: Event,
    old_guarantee: Any,
    new_guarantee: Any,
) -> dict[str, object]:
    return {
        "title": "Изменилась гарантия",
        "body": f"У турнира «{event.name}» изменилась гарантия",
        "url": event_canonical_path(event),
        "type": NotificationType.GUARANTEE_CHANGED.value,
        "event_id": str(event.id),
        "series_id": str(event.series_id),
        "old_guarantee": old_guarantee,
        "new_guarantee": new_guarantee,
    }


def payload_flight_time_changed(
    *,
    event: Event,
    flight_ids: list[UUID],
    old_start_at: str | None = None,
    new_start_at: str | None = None,
) -> dict[str, object]:
    if len(flight_ids) == 1:
        body = f"У турнира «{event.name}» изменилось время старта"
    else:
        body = f"У турнира «{event.name}» изменилось время стартов"
    payload: dict[str, object] = {
        "title": "Изменилось время старта",
        "body": body,
        "url": event_canonical_path(event),
        "type": NotificationType.TIME_CHANGED.value,
        "event_id": str(event.id),
        "series_id": str(event.series_id),
        "flight_ids": [str(item) for item in flight_ids],
    }
    if old_start_at is not None:
        payload["old_start_at"] = old_start_at
    if new_start_at is not None:
        payload["new_start_at"] = new_start_at
    return payload


def plan_impacts_for_series_update(
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
    series: Series,
) -> list[PlannedNotification]:
    planned: list[PlannedNotification] = []
    old_status = old_snapshot.get("status")
    new_status = new_snapshot.get("status")
    target = TargetSelector(kind="series_bookmarks", series_id=series.id)

    if new_status == SeriesStatus.CANCELLED.value and old_status != SeriesStatus.CANCELLED.value:
        payload = payload_series_cancelled(series=series)
        planned.append(
            PlannedNotification(
                type=NotificationType.SERIES_CANCELLED,
                title=str(payload["title"]),
                body=str(payload["body"]),
                url=str(payload["url"]),
                target=target,
                extra={
                    key: value
                    for key, value in payload.items()
                    if key not in {"title", "body", "url", "type"}
                },
            )
        )
        return planned

    if (
        new_status == SeriesStatus.SCHEDULE_PUBLISHED.value
        and old_status == SeriesStatus.ANNOUNCED.value
    ):
        payload = payload_schedule_published(series=series)
        planned.append(
            PlannedNotification(
                type=NotificationType.SCHEDULE_PUBLISHED,
                title=str(payload["title"]),
                body=str(payload["body"]),
                url=str(payload["url"]),
                target=target,
                extra={
                    key: value
                    for key, value in payload.items()
                    if key not in {"title", "body", "url", "type"}
                },
            )
        )

    if old_snapshot.get("starts_on") != new_snapshot.get("starts_on") or old_snapshot.get(
        "ends_on"
    ) != new_snapshot.get("ends_on"):
        payload = payload_series_time_changed(
            series=series,
            old_starts_on=_as_optional_str(old_snapshot.get("starts_on")),
            new_starts_on=_as_optional_str(new_snapshot.get("starts_on")),
            old_ends_on=_as_optional_str(old_snapshot.get("ends_on")),
            new_ends_on=_as_optional_str(new_snapshot.get("ends_on")),
        )
        planned.append(
            PlannedNotification(
                type=NotificationType.TIME_CHANGED,
                title=str(payload["title"]),
                body=str(payload["body"]),
                url=str(payload["url"]),
                target=target,
                extra={
                    key: value
                    for key, value in payload.items()
                    if key not in {"title", "body", "url", "type"}
                },
            )
        )

    return planned


def plan_impacts_for_event_update(
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
    event: Event,
) -> list[PlannedNotification]:
    planned: list[PlannedNotification] = []
    target = TargetSelector(kind="event_flight_bookmarks", event_id=event.id)
    old_status = old_snapshot.get("status")
    new_status = new_snapshot.get("status")

    if new_status == EventStatus.CANCELLED.value and old_status != EventStatus.CANCELLED.value:
        payload = payload_event_cancelled(event=event)
        planned.append(
            PlannedNotification(
                type=NotificationType.EVENT_CANCELLED,
                title=str(payload["title"]),
                body=str(payload["body"]),
                url=str(payload["url"]),
                target=target,
                extra={
                    key: value
                    for key, value in payload.items()
                    if key not in {"title", "body", "url", "type"}
                },
            )
        )
        return planned

    if old_snapshot.get("guarantee") != new_snapshot.get("guarantee"):
        payload = payload_guarantee_changed(
            event=event,
            old_guarantee=old_snapshot.get("guarantee"),
            new_guarantee=new_snapshot.get("guarantee"),
        )
        planned.append(
            PlannedNotification(
                type=NotificationType.GUARANTEE_CHANGED,
                title=str(payload["title"]),
                body=str(payload["body"]),
                url=str(payload["url"]),
                target=target,
                extra={
                    key: value
                    for key, value in payload.items()
                    if key not in {"title", "body", "url", "type"}
                },
            )
        )

    return planned


def plan_impacts_for_flight_updates(
    updates: list[tuple[dict[str, Any], dict[str, Any], Flight]],
    event: Event,
) -> list[PlannedNotification]:
    changed: list[tuple[UUID, str | None, str | None]] = []
    for old_snapshot, new_snapshot, flight in updates:
        if not old_snapshot:
            # Create: no time-change fan-out (change_log CREATED is enough).
            continue
        if old_snapshot.get("start_at") != new_snapshot.get("start_at"):
            changed.append(
                (
                    flight.id,
                    _as_optional_str(old_snapshot.get("start_at")),
                    _as_optional_str(new_snapshot.get("start_at")),
                )
            )

    if not changed:
        return []

    changed_flight_ids = [item[0] for item in changed]
    primary_old = changed[0][1] if len(changed) == 1 else None
    primary_new = changed[0][2] if len(changed) == 1 else None
    payload = payload_flight_time_changed(
        event=event,
        flight_ids=changed_flight_ids,
        old_start_at=primary_old,
        new_start_at=primary_new,
    )
    return [
        PlannedNotification(
            type=NotificationType.TIME_CHANGED,
            title=str(payload["title"]),
            body=str(payload["body"]),
            url=str(payload["url"]),
            target=TargetSelector(
                kind="flights_bookmarks",
                event_id=event.id,
                flight_ids=tuple(changed_flight_ids),
            ),
            extra={
                key: value
                for key, value in payload.items()
                if key not in {"title", "body", "url", "type"}
            },
        )
    ]


async def series_bookmark_user_ids(
    session: AsyncSession,
    series_id: UUID,
) -> list[UUID]:
    result = await session.scalars(
        select(Bookmark.user_id)
        .where(
            Bookmark.target_type == BookmarkTarget.SERIES,
            Bookmark.target_id == series_id,
        )
        .distinct()
    )
    return list(result)


async def event_flight_bookmark_user_ids(
    session: AsyncSession,
    event_id: UUID,
) -> list[UUID]:
    flight_ids = list(await session.scalars(select(Flight.id).where(Flight.event_id == event_id)))
    if not flight_ids:
        return []
    return await flights_bookmark_user_ids(session, flight_ids)


async def flight_bookmark_user_ids(
    session: AsyncSession,
    flight_id: UUID,
) -> list[UUID]:
    result = await session.scalars(
        select(Bookmark.user_id)
        .where(
            Bookmark.target_type == BookmarkTarget.FLIGHT,
            Bookmark.target_id == flight_id,
        )
        .distinct()
    )
    return list(result)


async def flights_bookmark_user_ids(
    session: AsyncSession,
    flight_ids: list[UUID],
) -> list[UUID]:
    if not flight_ids:
        return []
    result = await session.scalars(
        select(Bookmark.user_id)
        .where(
            Bookmark.target_type == BookmarkTarget.FLIGHT,
            Bookmark.target_id.in_(flight_ids),
        )
        .distinct()
    )
    return list(result)


async def resolve_target_user_ids(
    session: AsyncSession,
    target: TargetSelector,
) -> list[UUID]:
    if target.kind == "series_bookmarks":
        if target.series_id is None:
            return []
        return await series_bookmark_user_ids(session, target.series_id)
    if target.kind == "event_flight_bookmarks":
        if target.event_id is None:
            return []
        return await event_flight_bookmark_user_ids(session, target.event_id)
    if target.kind == "flight_bookmarks":
        if target.flight_id is None:
            return []
        return await flight_bookmark_user_ids(session, target.flight_id)
    if target.kind == "flights_bookmarks":
        return await flights_bookmark_user_ids(session, list(target.flight_ids))
    return []


async def enqueue_change_notifications(
    session: AsyncSession,
    *,
    change_log: ChangeLog,
    user_ids: list[UUID],
    notif_type: NotificationType,
    payload: dict[str, object],
) -> list[NotificationQueue]:
    """Create pending change notifications; skip duplicates via unique index."""
    now = datetime.now(UTC)
    deduped_user_ids = list(dict.fromkeys(user_ids))
    created: list[NotificationQueue] = []
    if not deduped_user_ids:
        change_log.notified_at = now
        await session.flush()
        return created

    existing_user_ids = set(
        await session.scalars(
            select(NotificationQueue.user_id).where(
                NotificationQueue.change_log_id == change_log.id,
                NotificationQueue.user_id.in_(deduped_user_ids),
                NotificationQueue.type == notif_type,
            )
        )
    )

    for user_id in deduped_user_ids:
        if user_id in existing_user_ids:
            continue

        row = NotificationQueue(
            user_id=user_id,
            bookmark_id=None,
            change_log_id=change_log.id,
            type=notif_type,
            payload=payload,
            scheduled_at=now,
            status=NotificationStatus.PENDING,
            attempts=0,
        )
        try:
            async with session.begin_nested():
                session.add(row)
                await session.flush()
        except IntegrityError:
            continue
        created.append(row)

    change_log.notified_at = now
    await session.flush()
    return created


async def enqueue_planned_notifications(
    session: AsyncSession,
    *,
    change_log: ChangeLog,
    planned: list[PlannedNotification],
) -> list[NotificationQueue]:
    """Fan-out a confirm batch; dedupe by (user_id, type) across the batch."""
    seen: set[tuple[UUID, NotificationType]] = set()
    created: list[NotificationQueue] = []
    # Group recipients per planned item type while preserving first payload wins.
    batches: list[tuple[NotificationType, dict[str, object], list[UUID]]] = []
    target_cache: dict[
        tuple[
            str,
            UUID | None,
            UUID | None,
            UUID | None,
            tuple[UUID, ...],
        ],
        list[UUID],
    ] = {}

    for item in planned:
        cache_key = (
            item.target.kind,
            item.target.series_id,
            item.target.event_id,
            item.target.flight_id,
            tuple(item.target.flight_ids),
        )
        if cache_key not in target_cache:
            target_cache[cache_key] = await resolve_target_user_ids(session, item.target)
        user_ids = target_cache[cache_key]
        filtered: list[UUID] = []
        for user_id in user_ids:
            key = (user_id, item.type)
            if key in seen:
                continue
            seen.add(key)
            filtered.append(user_id)
        batches.append((item.type, item.payload_dict(), filtered))

    for notif_type, payload, user_ids in batches:
        rows = await enqueue_change_notifications(
            session,
            change_log=change_log,
            user_ids=user_ids,
            notif_type=notif_type,
            payload=payload,
        )
        created.extend(rows)

    if not batches:
        change_log.notified_at = datetime.now(UTC)
        await session.flush()

    return created


def _as_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
