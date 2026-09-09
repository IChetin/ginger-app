"""План изменений: черновик файла против текущего состояния базы.

Считается заново на каждый предпросмотр и ещё раз при публикации — publish не
доверяет присланному плану, а сверяет его отпечаток с preview-токеном.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import EventStatus, SeriesStatus
from app.models.schedule import Event, Flight, Series
from app.schemas.bulk_import import (
    BulkAction,
    BulkCounts,
    BulkEventDraft,
    BulkEventPlan,
    BulkFieldDiff,
    BulkFlightDraft,
    BulkFlightPlan,
    BulkImportDraft,
    BulkIssue,
    BulkSeriesDraft,
    BulkSeriesPlan,
)
from app.schemas.notifications import NotificationImpactItem
from app.services import change_log as change_log_service
from app.services import change_notifications as change_notifications_service
from app.services.change_notifications import PlannedNotification
from app.services.imports.bulk.normalize import normalize_key, normalize_name
from app.services.imports.bulk.references import ReferenceResolution
from app.utils.timezone import to_venue_local, venue_local_to_utc

# Статусы, в которых массовая загрузка не трогает статус серии.
FROZEN_SERIES_STATUSES = frozenset({SeriesStatus.FINISHED, SeriesStatus.CANCELLED})

SERIES_FIELD_LABELS: dict[str, str] = {
    "name": "название",
    "organizer": "организатор",
    "venue": "площадка",
    "starts_on": "начало",
    "ends_on": "конец",
    "guarantee": "гарантия серии",
    "poster_url": "афиша",
    "source_url": "источник",
    "status": "статус",
}

EVENT_FIELD_LABELS: dict[str, str] = {
    "number": "номер",
    "name": "название",
    "buyin": "бай-ин",
    "buyin_bounty": "баунти-часть",
    "guarantee": "гарантия",
    "game_type": "дисциплина",
    "tags": "теги",
    "start_stack": "стартовый стек",
    "start_blinds": "стартовые блайнды",
    "reentry": "ре-энтри",
    "late_reg_level": "поздняя регистрация",
    "day_end_note": "заметка ITM",
    "status": "статус",
    "notes": "заметки",
}

FLIGHT_FIELD_LABELS: dict[str, str] = {
    "start_at": "время",
    "level_minutes": "уровни",
}


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "да" if value else "нет"
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.strftime("%d.%m.%Y")
    if isinstance(value, list):
        return ", ".join(str(item) for item in value) or None
    return str(value)


def _diff(
    field_name: str,
    labels: dict[str, str],
    old: Any,
    new: Any,
    *,
    old_text: str | None = None,
    new_text: str | None = None,
) -> BulkFieldDiff | None:
    if old == new:
        return None
    return BulkFieldDiff(
        field=field_name,
        label=labels[field_name],
        old_value=old_text if old_text is not None else _text(old),
        new_value=new_text if new_text is not None else _text(new),
    )


def _diff_optional(
    field_name: str,
    labels: dict[str, str],
    old: Any,
    new: Any,
    *,
    old_text: str | None = None,
    new_text: str | None = None,
) -> BulkFieldDiff | None:
    """Пустая ячейка — «в файле нет данных», а не «сотри значение в базе»."""
    if new is None or new == []:
        return None
    return _diff(field_name, labels, old, new, old_text=old_text, new_text=new_text)


def _reentry_text(count: int | None, unlimited: bool) -> str | None:
    if unlimited:
        return "безлимит"
    return None if count is None else str(count)


@dataclass
class FlightChange:
    label: str | None
    action: BulkAction
    start_at: datetime | None
    level_minutes: str | None
    existing: Flight | None = None
    diffs: list[BulkFieldDiff] = field(default_factory=list)

    def to_plan(self, timezone_name: str) -> BulkFlightPlan:
        local = (
            to_venue_local(self.start_at, timezone_name).strftime("%d.%m.%Y %H:%M")
            if self.start_at is not None
            else None
        )
        return BulkFlightPlan(
            label=self.label,
            action=self.action,
            starts_at_local=local,
            diffs=self.diffs,
        )


@dataclass
class EventChange:
    import_key: str | None
    name: str
    action: BulkAction
    draft: BulkEventDraft | None = None
    existing: Event | None = None
    cancel: bool = False
    diffs: list[BulkFieldDiff] = field(default_factory=list)
    flights: list[FlightChange] = field(default_factory=list)
    recipients: int = 0

    @property
    def will_change(self) -> bool:
        """Исчезнувший турнир меняет базу только при включённой галочке отмены."""
        return self.cancel or self.action in {"create", "update"}

    def to_plan(self, timezone_name: str) -> BulkEventPlan:
        return BulkEventPlan(
            import_key=self.import_key,
            name=self.name,
            action=self.action,
            diffs=self.diffs,
            flights=[item.to_plan(timezone_name) for item in self.flights],
            recipients=self.recipients,
        )


@dataclass
class SeriesChange:
    draft: BulkSeriesDraft
    action: BulkAction
    timezone_name: str
    existing: Series | None = None
    new_status: SeriesStatus | None = None
    diffs: list[BulkFieldDiff] = field(default_factory=list)
    events: list[EventChange] = field(default_factory=list)
    warnings: list[BulkIssue] = field(default_factory=list)
    recipients: int = 0

    def to_plan(self) -> BulkSeriesPlan:
        return BulkSeriesPlan(
            import_key=self.draft.import_key,
            name=self.draft.name,
            action=self.action,
            series_id=self.existing.id if self.existing is not None else None,
            diffs=self.diffs,
            events=[item.to_plan(self.timezone_name) for item in self.events],
            recipients=self.recipients,
            warnings=self.warnings,
        )


@dataclass
class BulkPlan:
    changes: list[SeriesChange] = field(default_factory=list)
    series_counts: BulkCounts = field(default_factory=BulkCounts)
    event_counts: BulkCounts = field(default_factory=BulkCounts)
    flight_counts: BulkCounts = field(default_factory=BulkCounts)
    impacts: list[NotificationImpactItem] = field(default_factory=list)
    total_recipients: int = 0
    warnings: list[BulkIssue] = field(default_factory=list)
    mark_missing_cancelled: bool = False

    def to_plans(self) -> list[BulkSeriesPlan]:
        return [item.to_plan() for item in self.changes]

    def digest(self) -> dict[str, Any]:
        """Отпечаток плана для preview-токена: изменилась база — токен недействителен."""
        return {
            "mark_missing_cancelled": self.mark_missing_cancelled,
            "series": [
                {
                    "key": change.draft.import_key,
                    "action": change.action,
                    "id": str(change.existing.id) if change.existing else None,
                    "status": change.new_status.value if change.new_status else None,
                    "diffs": [item.model_dump() for item in change.diffs],
                    "events": [
                        {
                            "key": event.import_key,
                            "action": event.action,
                            "cancel": event.cancel,
                            "id": str(event.existing.id) if event.existing else None,
                            "diffs": [item.model_dump() for item in event.diffs],
                            "flights": [
                                {
                                    "label": flight.label,
                                    "action": flight.action,
                                    "start_at": (
                                        flight.start_at.isoformat() if flight.start_at else None
                                    ),
                                    "level_minutes": flight.level_minutes,
                                }
                                for flight in event.flights
                            ],
                        }
                        for event in change.events
                    ],
                }
                for change in self.changes
            ],
        }


def _flight_key(label: str | None) -> str:
    return normalize_key(label or "")


def _start_at(flight: BulkFlightDraft, timezone_name: str) -> datetime:
    return venue_local_to_utc(datetime.combine(flight.play_date, flight.play_time), timezone_name)


def _local_time_text(value: datetime, timezone_name: str, *, with_date: bool) -> str:
    local = to_venue_local(value, timezone_name)
    return local.strftime("%d.%m.%Y %H:%M") if with_date else local.strftime("%H:%M")


def _diff_flight(
    draft: BulkFlightDraft,
    existing: Flight,
    timezone_name: str,
) -> list[BulkFieldDiff]:
    diffs: list[BulkFieldDiff] = []
    start_at = _start_at(draft, timezone_name)
    if start_at != existing.start_at:
        old_local = to_venue_local(existing.start_at, timezone_name)
        new_local = to_venue_local(start_at, timezone_name)
        with_date = old_local.date() != new_local.date()
        diffs.append(
            BulkFieldDiff(
                field="start_at",
                label=FLIGHT_FIELD_LABELS["start_at"],
                old_value=_local_time_text(existing.start_at, timezone_name, with_date=with_date),
                new_value=_local_time_text(start_at, timezone_name, with_date=with_date),
            )
        )
    level = _diff_optional(
        "level_minutes", FLIGHT_FIELD_LABELS, existing.level_minutes, draft.level_minutes
    )
    if level is not None:
        diffs.append(level)
    return diffs


def _diff_event(draft: BulkEventDraft, existing: Event) -> list[BulkFieldDiff]:
    reentry_given = draft.reentry_count is not None or draft.reentry_unlimited
    candidates = (
        _diff_optional("number", EVENT_FIELD_LABELS, existing.number, draft.number),
        _diff("name", EVENT_FIELD_LABELS, existing.name, draft.name),
        _diff("buyin", EVENT_FIELD_LABELS, existing.buyin, draft.buyin),
        _diff_optional(
            "buyin_bounty", EVENT_FIELD_LABELS, existing.buyin_bounty, draft.buyin_bounty
        ),
        _diff_optional("guarantee", EVENT_FIELD_LABELS, existing.guarantee, draft.guarantee),
        _diff_optional(
            "game_type",
            EVENT_FIELD_LABELS,
            existing.game_type.value,
            draft.game_type.value if draft.game_type else None,
        ),
        _diff_optional(
            "tags",
            EVENT_FIELD_LABELS,
            sorted(existing.tags),
            sorted(draft.tags),
            old_text=_text(list(existing.tags)),
            new_text=_text(list(draft.tags)),
        ),
        _diff_optional("start_stack", EVENT_FIELD_LABELS, existing.start_stack, draft.start_stack),
        _diff_optional(
            "start_blinds", EVENT_FIELD_LABELS, existing.start_blinds, draft.start_blinds
        ),
        _diff(
            "reentry",
            EVENT_FIELD_LABELS,
            (existing.reentry_count, existing.reentry_unlimited),
            (draft.reentry_count, draft.reentry_unlimited) if reentry_given else None,
            old_text=_reentry_text(existing.reentry_count, existing.reentry_unlimited),
            new_text=_reentry_text(draft.reentry_count, draft.reentry_unlimited),
        )
        if reentry_given
        else None,
        _diff_optional(
            "late_reg_level", EVENT_FIELD_LABELS, existing.late_reg_level, draft.late_reg_level
        ),
        _diff_optional(
            "day_end_note", EVENT_FIELD_LABELS, existing.day_end_note, draft.day_end_note
        ),
        _diff_optional(
            "status",
            EVENT_FIELD_LABELS,
            existing.status.value,
            draft.status.value if draft.status else None,
        ),
        _diff_optional("notes", EVENT_FIELD_LABELS, existing.notes, draft.notes),
    )
    return [item for item in candidates if item is not None]


def _diff_series(
    draft: BulkSeriesDraft,
    existing: Series,
    *,
    organizer_name: str,
    venue_name: str,
    new_status: SeriesStatus | None,
) -> list[BulkFieldDiff]:
    candidates = [
        _diff("name", SERIES_FIELD_LABELS, existing.name, draft.name),
        _diff(
            "organizer",
            SERIES_FIELD_LABELS,
            normalize_name(organizer_name),
            normalize_name(draft.organizer_name),
            old_text=organizer_name,
            new_text=draft.organizer_name,
        ),
        _diff(
            "venue",
            SERIES_FIELD_LABELS,
            normalize_name(venue_name),
            normalize_name(draft.venue_name),
            old_text=venue_name,
            new_text=draft.venue_name,
        ),
        _diff("starts_on", SERIES_FIELD_LABELS, existing.starts_on, draft.starts_on),
        _diff("ends_on", SERIES_FIELD_LABELS, existing.ends_on, draft.ends_on),
        _diff_optional("guarantee", SERIES_FIELD_LABELS, existing.guarantee, draft.guarantee),
        _diff_optional("poster_url", SERIES_FIELD_LABELS, existing.poster_url, draft.poster_url),
        _diff_optional(
            "source_url",
            SERIES_FIELD_LABELS,
            existing.links.get("source"),
            draft.source_url,
        ),
    ]
    if new_status is not None and new_status != existing.status:
        candidates.append(
            _diff("status", SERIES_FIELD_LABELS, existing.status.value, new_status.value)
        )
    return [item for item in candidates if item is not None]


async def _load_existing(
    session: AsyncSession,
    keys: list[str],
) -> tuple[dict[str, Series], dict[UUID, list[Event]]]:
    if not keys:
        return {}, {}
    rows = await session.scalars(
        select(Series)
        .where(Series.import_key.in_(keys))
        .options(selectinload(Series.organizer), selectinload(Series.venue))
    )
    series_by_key = {item.import_key: item for item in rows if item.import_key}
    if not series_by_key:
        return {}, {}

    events = await session.scalars(
        select(Event)
        .where(Event.series_id.in_([item.id for item in series_by_key.values()]))
        .options(selectinload(Event.flights), selectinload(Event.series))
    )
    events_by_series: dict[UUID, list[Event]] = {}
    for event in events:
        events_by_series.setdefault(event.series_id, []).append(event)
    return series_by_key, events_by_series


async def _lookalike_warning(
    session: AsyncSession,
    draft: BulkSeriesDraft,
) -> BulkIssue | None:
    """Серия с таким же названием, но без ключа — вероятно, та же, заведённая руками."""
    found = await session.scalar(
        select(Series.name)
        .where(
            Series.import_key.is_(None),
            func.lower(Series.name) == draft.name.lower(),
            Series.starts_on <= draft.ends_on,
            Series.ends_on >= draft.starts_on,
        )
        .limit(1)
    )
    if found is None:
        return None
    return BulkIssue(
        severity="warning",
        code="possible_duplicate",
        message=(
            f"В системе уже есть серия «{found}» с пересекающимися датами и без ключа импорта. "
            f"Массовая загрузка создаст отдельную серию — проверьте, не дубль ли это."
        ),
        row=draft.source_row,
        field="series_key",
        series_key=draft.import_key,
    )


def _plan_series_status(existing: Series) -> tuple[SeriesStatus | None, BulkIssue | None]:
    if existing.status in FROZEN_SERIES_STATUSES:
        return None, BulkIssue(
            severity="warning",
            code="series_frozen_status",
            message=(
                f"Серия в статусе «{existing.status.value}»: поля и турниры обновятся, "
                "статус останется прежним."
            ),
            field="status",
        )
    if existing.status == SeriesStatus.ANNOUNCED:
        return SeriesStatus.SCHEDULE_PUBLISHED, None
    return existing.status, None


def _plan_notifications(
    change: SeriesChange,
) -> list[tuple[EventChange | None, PlannedNotification]]:
    """Что уйдёт подписчикам, если опубликовать этот план."""
    planned: list[tuple[EventChange | None, PlannedNotification]] = []
    existing = change.existing
    if existing is None:
        # У новой серии подписчиков быть не может.
        return planned

    old_series = change_log_service.series_snapshot(existing)
    new_series = dict(old_series)
    for diff in change.diffs:
        if diff.field == "status" and change.new_status is not None:
            new_series["status"] = change.new_status.value
        elif diff.field == "starts_on":
            new_series["starts_on"] = change.draft.starts_on.isoformat()
        elif diff.field == "ends_on":
            new_series["ends_on"] = change.draft.ends_on.isoformat()
    planned.extend(
        (None, item)
        for item in change_notifications_service.plan_impacts_for_series_update(
            old_series, new_series, existing
        )
    )

    for event_change in change.events:
        event = event_change.existing
        if event is None:
            continue
        old_event = change_log_service.event_snapshot(event)
        new_event = dict(old_event)
        if event_change.cancel:
            new_event["status"] = EventStatus.CANCELLED.value
        else:
            for diff in event_change.diffs:
                if diff.field == "guarantee" and event_change.draft is not None:
                    new_event["guarantee"] = change_log_service.json_safe(
                        event_change.draft.guarantee
                    )
                elif diff.field == "status" and event_change.draft is not None:
                    new_event["status"] = event_change.draft.status.value
        planned.extend(
            (event_change, item)
            for item in change_notifications_service.plan_impacts_for_event_update(
                old_event, new_event, event
            )
        )

        flight_updates: list[tuple[dict[str, Any], dict[str, Any], Flight]] = []
        for flight_change in event_change.flights:
            if flight_change.action != "update" or flight_change.existing is None:
                continue
            if flight_change.start_at is None:
                continue
            old_flight = change_log_service.flight_snapshot(flight_change.existing)
            new_flight = dict(old_flight)
            new_flight["start_at"] = flight_change.start_at.isoformat()
            flight_updates.append((old_flight, new_flight, flight_change.existing))
        if flight_updates:
            planned.extend(
                (event_change, item)
                for item in change_notifications_service.plan_impacts_for_flight_updates(
                    flight_updates, event
                )
            )

    return planned


async def build_plan(
    session: AsyncSession,
    draft: BulkImportDraft,
    resolution: ReferenceResolution,
    *,
    mark_missing_cancelled: bool = False,
) -> BulkPlan:
    plan = BulkPlan(mark_missing_cancelled=mark_missing_cancelled)
    keys = [item.import_key for item in draft.series]
    series_by_key, events_by_series = await _load_existing(session, keys)

    for series_draft in draft.series:
        existing = series_by_key.get(series_draft.import_key)
        change = SeriesChange(
            draft=series_draft,
            action="create" if existing is None else "unchanged",
            timezone_name=series_draft.timezone,
            existing=existing,
        )

        if existing is None:
            change.new_status = SeriesStatus.SCHEDULE_PUBLISHED
            lookalike = await _lookalike_warning(session, series_draft)
            if lookalike is not None:
                change.warnings.append(lookalike)
            change.events = [
                _build_new_event(item, series_draft.timezone) for item in series_draft.events
            ]
        else:
            new_status, frozen_warning = _plan_series_status(existing)
            change.new_status = new_status
            if frozen_warning is not None:
                change.warnings.append(frozen_warning)
            change.diffs = _diff_series(
                series_draft,
                existing,
                organizer_name=existing.organizer.name,
                venue_name=existing.venue.name,
                new_status=new_status,
            )
            change.events = _diff_events(
                series_draft,
                events_by_series.get(existing.id, []),
                mark_missing_cancelled=mark_missing_cancelled,
            )
            touched = bool(change.diffs) or any(item.will_change for item in change.events)
            change.action = "update" if touched else "unchanged"

        plan.changes.append(change)

    _count(plan)
    await _resolve_recipients(session, plan)
    return plan


def _build_new_event(draft: BulkEventDraft, timezone_name: str) -> EventChange:
    return EventChange(
        import_key=draft.import_key,
        name=draft.name,
        action="create",
        draft=draft,
        flights=[
            FlightChange(
                label=item.label,
                action="create",
                start_at=_start_at(item, timezone_name),
                level_minutes=item.level_minutes,
            )
            for item in draft.flights
        ],
    )


def _diff_events(
    series_draft: BulkSeriesDraft,
    existing_events: list[Event],
    *,
    mark_missing_cancelled: bool,
) -> list[EventChange]:
    # Турниры без ключа импорта заведены другим способом — файл про них ничего не знает.
    keyed = {event.import_key: event for event in existing_events if event.import_key}
    changes: list[EventChange] = []

    for event_draft in series_draft.events:
        existing = keyed.pop(event_draft.import_key, None)
        if existing is None:
            changes.append(_build_new_event(event_draft, series_draft.timezone))
            continue

        diffs = _diff_event(event_draft, existing)
        flights = _diff_flights(event_draft, existing, series_draft.timezone)
        touched = bool(diffs) or any(
            item.action not in {"unchanged", "missing"} for item in flights
        )
        changes.append(
            EventChange(
                import_key=event_draft.import_key,
                name=event_draft.name,
                action="update" if touched else "unchanged",
                draft=event_draft,
                existing=existing,
                diffs=diffs,
                flights=flights,
            )
        )

    for orphan in keyed.values():
        already_cancelled = orphan.status == EventStatus.CANCELLED
        changes.append(
            EventChange(
                import_key=orphan.import_key,
                name=orphan.name,
                action="missing",
                existing=orphan,
                cancel=mark_missing_cancelled and not already_cancelled,
                diffs=(
                    [
                        BulkFieldDiff(
                            field="status",
                            label=EVENT_FIELD_LABELS["status"],
                            old_value=orphan.status.value,
                            new_value=EventStatus.CANCELLED.value,
                        )
                    ]
                    if mark_missing_cancelled and not already_cancelled
                    else []
                ),
                flights=[
                    FlightChange(
                        label=flight.label,
                        action="missing",
                        start_at=flight.start_at,
                        level_minutes=flight.level_minutes,
                        existing=flight,
                    )
                    for flight in orphan.flights
                ],
            )
        )
    return changes


def _diff_flights(
    event_draft: BulkEventDraft,
    existing: Event,
    timezone_name: str,
) -> list[FlightChange]:
    by_label = {_flight_key(flight.label): flight for flight in existing.flights}
    changes: list[FlightChange] = []

    for flight_draft in event_draft.flights:
        found = by_label.pop(_flight_key(flight_draft.label), None)
        start_at = _start_at(flight_draft, timezone_name)
        if found is None:
            changes.append(
                FlightChange(
                    label=flight_draft.label,
                    action="create",
                    start_at=start_at,
                    level_minutes=flight_draft.level_minutes,
                )
            )
            continue
        diffs = _diff_flight(flight_draft, found, timezone_name)
        changes.append(
            FlightChange(
                label=flight_draft.label,
                action="update" if diffs else "unchanged",
                start_at=start_at,
                level_minutes=flight_draft.level_minutes,
                existing=found,
                diffs=diffs,
            )
        )

    changes.extend(
        FlightChange(
            label=flight.label,
            action="missing",
            start_at=flight.start_at,
            level_minutes=flight.level_minutes,
            existing=flight,
        )
        for flight in by_label.values()
    )
    return changes


def _count(plan: BulkPlan) -> None:
    for change in plan.changes:
        _bump(plan.series_counts, change.action)
        for event in change.events:
            _bump(plan.event_counts, event.action)
            for flight in event.flights:
                _bump(plan.flight_counts, flight.action)


def _bump(counts: BulkCounts, action: BulkAction) -> None:
    if action == "create":
        counts.created += 1
    elif action == "update":
        counts.updated += 1
    elif action == "missing":
        counts.missing += 1
    else:
        counts.unchanged += 1


async def _resolve_recipients(session: AsyncSession, plan: BulkPlan) -> None:
    impacts: list[NotificationImpactItem] = []
    everyone: set[UUID] = set()
    cache: dict[tuple[Any, ...], list[UUID]] = {}

    for change in plan.changes:
        series_users: set[UUID] = set()
        for event_change, notification in _plan_notifications(change):
            key = (
                notification.target.kind,
                notification.target.series_id,
                notification.target.event_id,
                notification.target.flight_id,
                tuple(notification.target.flight_ids),
            )
            if key not in cache:
                cache[key] = await change_notifications_service.resolve_target_user_ids(
                    session, notification.target
                )
            user_ids = cache[key]
            if not user_ids:
                continue
            everyone.update(user_ids)
            series_users.update(user_ids)
            if event_change is not None:
                event_change.recipients += len(user_ids)
            impacts.append(
                NotificationImpactItem(
                    type=notification.type,
                    title=notification.title,
                    body=notification.body,
                    url=notification.url,
                    recipient_count=len(user_ids),
                )
            )
        change.recipients = len(series_users)

    plan.impacts = impacts
    plan.total_recipients = len(everyone)


__all__ = [
    "BulkPlan",
    "EventChange",
    "FlightChange",
    "SeriesChange",
    "build_plan",
]
