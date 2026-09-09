from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.auth import User
from app.models.enums import BookmarkTarget, EventStatus, SeriesStatus
from app.models.imports import ImportJob
from app.models.notifications import Bookmark
from app.models.references import Currency, Organizer, Venue
from app.models.schedule import BlindLevel, ChangeLog, Event, Flight, Series
from app.models.tracker import Result
from app.schemas.admin_schedule import (
    BlindLevelAdminRead,
    BlindLevelUpsert,
    ChangeLogAdminRead,
    ChangeLogListItem,
    EventAdminRead,
    EventCreate,
    EventUpdate,
    FlightAdminRead,
    FlightUpsert,
    SeriesAdminRead,
    SeriesCreate,
    SeriesUpdate,
)
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.notifications import NotificationPreviewResponse
from app.schemas.schedule import (
    CountryBrief,
    CurrencyBrief,
    DateTimeWithTimezone,
    OrganizerBrief,
    VenueBrief,
)
from app.services import change_log as change_log_service
from app.services import change_notifications as change_notifications_service
from app.services import notification_previews as notification_previews_service
from app.services import notifications as notifications_service
from app.services.preview_tokens import hash_canonical, verify_preview_token
from app.services.organizer_logo import organizer_logo_url
from app.utils.timezone import to_venue_local, venue_local_date, venue_local_to_utc

FORWARD_SERIES_TRANSITIONS: dict[SeriesStatus, frozenset[SeriesStatus]] = {
    SeriesStatus.ANNOUNCED: frozenset({SeriesStatus.SCHEDULE_PUBLISHED, SeriesStatus.CANCELLED}),
    SeriesStatus.SCHEDULE_PUBLISHED: frozenset(
        {SeriesStatus.RUNNING, SeriesStatus.FINISHED, SeriesStatus.CANCELLED}
    ),
    SeriesStatus.RUNNING: frozenset({SeriesStatus.FINISHED, SeriesStatus.CANCELLED}),
    SeriesStatus.FINISHED: frozenset({SeriesStatus.CANCELLED}),
    SeriesStatus.CANCELLED: frozenset(),
}


def _venue_brief(venue: Venue) -> VenueBrief:
    return VenueBrief(
        id=venue.id,
        name=venue.name,
        city=venue.city,
        country_code=venue.country_code,
        zone=venue.zone,
        timezone=venue.timezone,
    )


def _organizer_brief(organizer: Organizer) -> OrganizerBrief:
    return OrganizerBrief(
        id=organizer.id,
        name=organizer.name,
        slug=organizer.slug,
        logo_url=organizer_logo_url(organizer),
    )


def _country_brief(venue: Venue) -> CountryBrief:
    return CountryBrief(code=venue.country.code, name_ru=venue.country.name_ru)


def _build_datetime(utc_dt: datetime, venue_timezone: str) -> DateTimeWithTimezone:
    return DateTimeWithTimezone(
        utc=utc_dt,
        venue_local=to_venue_local(utc_dt, venue_timezone),
        venue_timezone=venue_timezone,
    )


def _series_admin_read(
    series: Series,
    events_count: int,
    *,
    bookmarks_count: int = 0,
) -> SeriesAdminRead:
    return SeriesAdminRead(
        id=series.id,
        organizer_id=series.organizer_id,
        venue_id=series.venue_id,
        name=series.name,
        slug=series.slug,
        starts_on=series.starts_on,
        ends_on=series.ends_on,
        status=series.status,
        poster_url=series.poster_url,
        links=dict(series.links),
        description=series.description,
        organizer=_organizer_brief(series.organizer),
        venue=_venue_brief(series.venue),
        country=_country_brief(series.venue),
        events_count=events_count,
        bookmarks_count=bookmarks_count,
        created_at=series.created_at,
        updated_at=series.updated_at,
    )


def _flight_admin_read(
    flight: Flight,
    venue_timezone: str,
    *,
    bookmarks_count: int = 0,
) -> FlightAdminRead:
    return FlightAdminRead(
        id=flight.id,
        label=flight.label,
        start_at=_build_datetime(flight.start_at, venue_timezone),
        bookmarks_count=bookmarks_count,
    )


def _event_admin_read(
    event: Event,
    venue_timezone: str,
    *,
    bookmarks_count: int = 0,
    flight_bookmarks: dict[UUID, int] | None = None,
) -> EventAdminRead:
    flights = sorted(event.flights, key=lambda item: item.start_at)
    blinds = sorted(event.blind_levels, key=lambda item: item.level_no)
    flight_counts = flight_bookmarks or {}
    return EventAdminRead(
        id=event.id,
        series_id=event.series_id,
        number=event.number,
        name=event.name,
        slug=event.slug,
        buyin=event.buyin,
        buyin_bounty=event.buyin_bounty,
        currency_code=event.currency_code,
        currency=CurrencyBrief(code=event.currency.code, symbol=event.currency.symbol),
        guarantee=event.guarantee,
        game_type=event.game_type,
        tags=list(event.tags),
        start_stack=event.start_stack,
        start_blinds=event.start_blinds,
        reentry_count=event.reentry_count,
        reentry_unlimited=event.reentry_unlimited,
        late_reg_level=event.late_reg_level,
        day_end_note=event.day_end_note,
        status=event.status,
        notes=event.notes,
        flights=[
            _flight_admin_read(
                flight,
                venue_timezone,
                bookmarks_count=flight_counts.get(flight.id, 0),
            )
            for flight in flights
        ],
        blind_levels=[BlindLevelAdminRead.model_validate(level) for level in blinds],
        bookmarks_count=bookmarks_count,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


async def _series_bookmarks_count(session: AsyncSession, series_id: UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Bookmark)
            .where(
                Bookmark.target_type == BookmarkTarget.SERIES,
                Bookmark.target_id == series_id,
            )
        )
        or 0
    )


async def _event_flight_bookmarks_count(session: AsyncSession, event_id: UUID) -> int:
    flight_ids = select(Flight.id).where(Flight.event_id == event_id)
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Bookmark)
            .where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id.in_(flight_ids),
            )
        )
        or 0
    )


async def _flight_bookmarks_counts(
    session: AsyncSession,
    flight_ids: list[UUID],
) -> dict[UUID, int]:
    if not flight_ids:
        return {}
    rows = await session.execute(
        select(Bookmark.target_id, func.count())
        .where(
            Bookmark.target_type == BookmarkTarget.FLIGHT,
            Bookmark.target_id.in_(flight_ids),
        )
        .group_by(Bookmark.target_id)
    )
    counts = {flight_id: 0 for flight_id in flight_ids}
    for target_id, count in rows.all():
        counts[target_id] = int(count)
    return counts


async def _event_flight_bookmarks_counts(
    session: AsyncSession,
    event_ids: list[UUID],
) -> dict[UUID, int]:
    if not event_ids:
        return {}
    rows = await session.execute(
        select(Flight.event_id, func.count(Bookmark.id))
        .select_from(Flight)
        .outerjoin(
            Bookmark,
            (Bookmark.target_type == BookmarkTarget.FLIGHT) & (Bookmark.target_id == Flight.id),
        )
        .where(Flight.event_id.in_(event_ids))
        .group_by(Flight.event_id)
    )
    counts = {event_id: 0 for event_id in event_ids}
    for event_id, count in rows.all():
        counts[event_id] = int(count)
    return counts


def _change_log_admin_read(entry: ChangeLog, actor: User | None) -> ChangeLogAdminRead:
    return ChangeLogAdminRead(
        id=entry.id,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        change_type=entry.change_type,
        old_value=entry.old_value,
        new_value=entry.new_value,
        actor_id=entry.actor_id,
        actor_email=actor.email if actor is not None else None,
        actor_nickname=actor.nickname if actor is not None else None,
        notified_at=entry.notified_at,
        created_at=entry.created_at,
    )


def _validate_series_status_transition(old: SeriesStatus, new: SeriesStatus) -> None:
    if old == new:
        return
    allowed = FORWARD_SERIES_TRANSITIONS.get(old, frozenset())
    if new not in allowed:
        raise AppError(
            "validation_error",
            f"Invalid series status transition: {old.value} → {new.value}",
            400,
        )


def _validate_date_range(starts_on: date, ends_on: date) -> None:
    if starts_on > ends_on:
        raise AppError(
            "validation_error",
            "starts_on must be less than or equal to ends_on",
            400,
        )


def _validate_reentry(*, reentry_unlimited: bool, reentry_count: int | None) -> None:
    if reentry_unlimited and reentry_count is not None:
        raise AppError(
            "validation_error",
            "reentry_unlimited and reentry_count are mutually exclusive",
            400,
        )


def _validate_flights_payload(
    items: list[FlightUpsert],
    *,
    series: Series,
    venue_timezone: str,
) -> list[tuple[FlightUpsert, datetime]]:
    if not items:
        raise AppError("validation_error", "At least one flight is required", 400)

    if len(items) == 1:
        if items[0].label is not None:
            raise AppError(
                "validation_error",
                "Single flight must have null label",
                400,
            )
    else:
        labels = [item.label for item in items]
        if any(label is None for label in labels):
            raise AppError(
                "validation_error",
                "All flights must have labels when there is more than one",
                400,
            )
        if len(set(labels)) != len(labels):
            raise AppError("validation_error", "Flight labels must be unique", 400)

    converted: list[tuple[FlightUpsert, datetime]] = []
    for item in items:
        try:
            start_at_utc = venue_local_to_utc(item.start_at, venue_timezone)
        except ValueError as exc:
            raise AppError("validation_error", str(exc), 400) from exc

        local_day = venue_local_date(start_at_utc, venue_timezone)
        if local_day < series.starts_on or local_day > series.ends_on:
            raise AppError(
                "validation_error",
                f"Flight date {local_day.isoformat()} is outside series range "
                f"{series.starts_on.isoformat()}…{series.ends_on.isoformat()}",
                400,
            )
        converted.append((item, start_at_utc))
    return converted


def _validate_blind_levels_payload(items: list[BlindLevelUpsert]) -> None:
    keys = [(item.structure_set_label or "default", item.level_no) for item in items]
    if len(set(keys)) != len(keys):
        raise AppError(
            "validation_error",
            "Blind level_no values must be unique within each structure set",
            400,
        )


async def _get_series(session: AsyncSession, series_id: UUID) -> Series:
    stmt = (
        select(Series)
        .where(Series.id == series_id)
        .options(
            selectinload(Series.organizer),
            selectinload(Series.venue).selectinload(Venue.country),
            selectinload(Series.events),
        )
    )
    series = await session.scalar(stmt)
    if series is None:
        raise NotFoundError("Series not found")
    return series


async def _lock_series(session: AsyncSession, series_id: UUID) -> Series:
    locked = await session.scalar(select(Series).where(Series.id == series_id).with_for_update())
    if locked is None:
        raise NotFoundError("Series not found")
    return await _get_series(session, series_id)


async def _get_event(session: AsyncSession, event_id: UUID) -> Event:
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.currency),
            selectinload(Event.flights),
            selectinload(Event.blind_levels),
            selectinload(Event.series).selectinload(Series.venue).selectinload(Venue.country),
            selectinload(Event.series).selectinload(Series.organizer),
        )
    )
    event = await session.scalar(stmt)
    if event is None:
        raise NotFoundError("Event not found")
    return event


async def _lock_event(session: AsyncSession, event_id: UUID) -> Event:
    locked = await session.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if locked is None:
        raise NotFoundError("Event not found")
    return await _get_event(session, event_id)


def _proposed_snapshot(old_snapshot: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    proposed = dict(old_snapshot)
    for key, value in payload.items():
        proposed[key] = change_log_service.json_safe(value)
    return proposed


def _series_would_log(old_snapshot: dict[str, Any], new_snapshot: dict[str, Any]) -> bool:
    old_diff, new_diff = change_log_service.changed_fields(old_snapshot, new_snapshot)
    if old_diff is None and new_diff is None:
        return False
    old_status = SeriesStatus(old_snapshot["status"])
    new_status = SeriesStatus(new_snapshot["status"])
    return (
        change_log_service.resolve_series_change_type(
            old_status=old_status,
            new_status=new_status,
        )
        is not None
    )


def _published_would_log(
    *,
    series_status: SeriesStatus,
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
) -> bool:
    if not change_log_service.is_series_published(series_status):
        return False
    old_diff, new_diff = change_log_service.changed_fields(old_snapshot, new_snapshot)
    return old_diff is not None or new_diff is not None


def _require_preview_token(preview_token: str | None) -> str:
    if preview_token is None or not preview_token.strip():
        raise AppError(
            "preview_required",
            "Preview confirmation required",
            400,
        )
    return preview_token


def _verify_confirm_token(
    *,
    preview_token: str,
    actor_id: UUID,
    entity_type: str,
    entity_id: UUID,
    old_snapshot: dict[str, Any],
    body: Any,
) -> None:
    verify_preview_token(
        preview_token,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        snapshot_hash=hash_canonical(old_snapshot),
        body_hash=hash_canonical(body),
        settings=get_settings(),
    )


def _sorted_flights(flights: list[Flight]) -> list[Flight]:
    return sorted(flights, key=lambda item: (item.start_at, str(item.id)))


def _flights_aggregate_snapshot(flights: list[Flight]) -> dict[str, Any]:
    snapshots = [change_log_service.flight_snapshot(flight) for flight in _sorted_flights(flights)]
    return {"flights": snapshots}


async def _ensure_organizer(session: AsyncSession, organizer_id: UUID) -> Organizer:
    organizer = await session.get(Organizer, organizer_id)
    if organizer is None:
        raise NotFoundError("Organizer not found")
    return organizer


async def _ensure_venue(session: AsyncSession, venue_id: UUID) -> Venue:
    stmt = select(Venue).where(Venue.id == venue_id).options(selectinload(Venue.country))
    venue = await session.scalar(stmt)
    if venue is None:
        raise NotFoundError("Venue not found")
    return venue


async def _ensure_currency(session: AsyncSession, currency_code: str) -> Currency:
    currency = await session.get(Currency, currency_code)
    if currency is None:
        raise NotFoundError(f"Currency {currency_code} not found")
    return currency


async def _assert_unique_event_number(
    session: AsyncSession,
    *,
    series_id: UUID,
    number: int | None,
    exclude_event_id: UUID | None = None,
) -> None:
    if number is None:
        return
    stmt = select(Event.id).where(Event.series_id == series_id, Event.number == number)
    if exclude_event_id is not None:
        stmt = stmt.where(Event.id != exclude_event_id)
    existing = await session.scalar(stmt)
    if existing is not None:
        raise ConflictError(f"Event number {number} already exists in this series")


async def list_series(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    search: str | None = None,
    status: SeriesStatus | None = None,
    country_code: str | None = None,
    organizer_id: UUID | None = None,
    empty_events: bool = False,
    stale: bool = False,
) -> PaginatedResponse[SeriesAdminRead]:
    base = select(Series).join(Series.venue).join(Series.organizer)
    if search:
        pattern = f"%{search.strip()}%"
        base = base.where(
            or_(
                Series.name.ilike(pattern),
                Venue.name.ilike(pattern),
                Venue.city.ilike(pattern),
            )
        )
    if status is not None:
        base = base.where(Series.status == status)
    if country_code is not None:
        base = base.where(Venue.country_code == country_code.upper())
    if organizer_id is not None:
        base = base.where(Series.organizer_id == organizer_id)
    if empty_events:
        events_count_filter = (
            select(func.count(Event.id))
            .where(Event.series_id == Series.id)
            .correlate(Series)
            .scalar_subquery()
        )
        base = base.where(events_count_filter == 0)
    if stale:
        today = datetime.now(UTC).date()
        overdue = and_(
            Series.ends_on < today,
            Series.status.not_in((SeriesStatus.FINISHED, SeriesStatus.CANCELLED)),
        )
        should_run = and_(
            Series.starts_on <= today,
            Series.ends_on >= today,
            Series.status.not_in((SeriesStatus.RUNNING, SeriesStatus.CANCELLED)),
        )
        base = base.where(or_(overdue, should_run))

    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    events_count = (
        select(func.count(Event.id))
        .where(Event.series_id == Series.id)
        .correlate(Series)
        .scalar_subquery()
    )
    bookmarks_count = (
        select(func.count(Bookmark.id))
        .where(
            Bookmark.target_type == BookmarkTarget.SERIES,
            Bookmark.target_id == Series.id,
        )
        .correlate(Series)
        .scalar_subquery()
    )
    rows = await session.execute(
        base.options(
            selectinload(Series.organizer),
            selectinload(Series.venue).selectinload(Venue.country),
        )
        .add_columns(events_count, bookmarks_count)
        .order_by(Series.starts_on.desc(), Series.name.asc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    items = [
        _series_admin_read(series, count, bookmarks_count=int(bm_count or 0))
        for series, count, bm_count in rows.all()
    ]
    return PaginatedResponse(
        items=items,
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def get_series(session: AsyncSession, series_id: UUID) -> SeriesAdminRead:
    series = await _get_series(session, series_id)
    bookmarks = await _series_bookmarks_count(session, series.id)
    return _series_admin_read(series, len(series.events), bookmarks_count=bookmarks)


async def create_series(
    session: AsyncSession,
    data: SeriesCreate,
    *,
    actor_id: UUID,
) -> SeriesAdminRead:
    from app.services import slugs as slugs_service

    del actor_id  # announced create is not logged
    await _ensure_organizer(session, data.organizer_id)
    await _ensure_venue(session, data.venue_id)
    _validate_date_range(data.starts_on, data.ends_on)

    organizer = await session.get(Organizer, data.organizer_id)
    venue = await session.get(Venue, data.venue_id)
    assert organizer is not None and venue is not None

    slug = await slugs_service.allocate_series_slug(
        session,
        organizer_slug=organizer.slug,
        city=venue.city,
        starts_on=data.starts_on,
        preferred=data.slug,
    )

    series = Series(
        organizer_id=data.organizer_id,
        venue_id=data.venue_id,
        name=data.name,
        slug=slug,
        starts_on=data.starts_on,
        ends_on=data.ends_on,
        status=SeriesStatus.ANNOUNCED,
        poster_url=data.poster_url,
        links=data.links,
        description=data.description,
    )
    session.add(series)
    await session.flush()
    series = await _get_series(session, series.id)
    return _series_admin_read(series, 0, bookmarks_count=0)


async def _prepare_series_update(
    session: AsyncSession,
    series: Series,
    data: SeriesUpdate,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    old_snapshot = change_log_service.series_snapshot(series)
    payload = data.model_dump(exclude_unset=True)

    if "organizer_id" in payload:
        await _ensure_organizer(session, payload["organizer_id"])
    if "venue_id" in payload:
        await _ensure_venue(session, payload["venue_id"])

    starts_on = payload.get("starts_on", series.starts_on)
    ends_on = payload.get("ends_on", series.ends_on)
    _validate_date_range(starts_on, ends_on)

    if "status" in payload:
        _validate_series_status_transition(series.status, payload["status"])

    proposed = _proposed_snapshot(old_snapshot, payload)
    return old_snapshot, proposed, payload


async def preview_series_update(
    session: AsyncSession,
    series_id: UUID,
    data: SeriesUpdate,
    *,
    actor_id: UUID,
) -> NotificationPreviewResponse:
    series = await _get_series(session, series_id)
    old_snapshot, proposed, _payload = await _prepare_series_update(session, series, data)
    body = data.model_dump(mode="json", exclude_unset=True)
    return await notification_previews_service.preview_series_update(
        session,
        series=series,
        old_snapshot=old_snapshot,
        new_snapshot=proposed,
        body=body,
        actor_id=actor_id,
    )


async def update_series(
    session: AsyncSession,
    series_id: UUID,
    data: SeriesUpdate,
    *,
    actor_id: UUID,
    preview_token: str | None = None,
    notify: bool = True,
) -> SeriesAdminRead:
    from app.services import slugs as slugs_service

    series = await _lock_series(session, series_id)
    old_snapshot, proposed, payload = await _prepare_series_update(session, series, data)
    body = data.model_dump(mode="json", exclude_unset=True)
    new_slug = payload.pop("slug", None)

    if _series_would_log(old_snapshot, proposed):
        token = _require_preview_token(preview_token)
        _verify_confirm_token(
            preview_token=token,
            actor_id=actor_id,
            entity_type="series",
            entity_id=series.id,
            old_snapshot=old_snapshot,
            body=body,
        )

    for field, value in payload.items():
        setattr(series, field, value)
    if new_slug is not None:
        await slugs_service.change_series_slug(session, series, new_slug)

    await session.flush()
    change_log = await change_log_service.log_series_update(
        session,
        series=series,
        old_snapshot=old_snapshot,
        actor_id=actor_id,
    )
    if change_log is not None:
        await _after_series_change_log(
            session,
            series=series,
            old_snapshot=old_snapshot,
            change_log=change_log,
            notify=notify,
        )
    series = await _get_series(session, series.id)
    bookmarks = await _series_bookmarks_count(session, series.id)
    return _series_admin_read(series, len(series.events), bookmarks_count=bookmarks)


async def _after_series_change_log(
    session: AsyncSession,
    *,
    series: Series,
    old_snapshot: dict[str, Any],
    change_log: ChangeLog,
    notify: bool = True,
) -> None:
    new_snapshot = change_log_service.series_snapshot(series)
    if notify:
        planned = change_notifications_service.plan_impacts_for_series_update(
            old_snapshot,
            new_snapshot,
            series,
        )
        await change_notifications_service.enqueue_planned_notifications(
            session,
            change_log=change_log,
            planned=planned,
        )

    old_status = SeriesStatus(old_snapshot["status"])
    if series.status == SeriesStatus.CANCELLED and old_status != SeriesStatus.CANCELLED:
        await notifications_service.cancel_pending_series_starting_for_series(
            session,
            series_id=series.id,
        )
        await notifications_service.cancel_pending_reminders_for_series(
            session,
            series_id=series.id,
        )
        return

    dates_changed = old_snapshot.get("starts_on") != new_snapshot.get("starts_on") or (
        old_snapshot.get("ends_on") != new_snapshot.get("ends_on")
    )
    published_now = (
        series.status == SeriesStatus.SCHEDULE_PUBLISHED and old_status == SeriesStatus.ANNOUNCED
    )
    if dates_changed or published_now:
        await notifications_service.reschedule_series_starting_for_series(
            session,
            series_id=series.id,
        )


async def delete_series(
    session: AsyncSession,
    series_id: UUID,
    *,
    actor_id: UUID,
) -> None:
    del actor_id
    series = await _get_series(session, series_id)

    event_ids = select(Event.id).where(Event.series_id == series_id)
    flight_ids = select(Flight.id).where(Flight.event_id.in_(event_ids))

    series_bookmarks = int(
        await session.scalar(
            select(func.count())
            .select_from(Bookmark)
            .where(
                Bookmark.target_type == BookmarkTarget.SERIES,
                Bookmark.target_id == series_id,
            )
        )
        or 0
    )
    flight_bookmarks = int(
        await session.scalar(
            select(func.count())
            .select_from(Bookmark)
            .where(
                Bookmark.target_type == BookmarkTarget.FLIGHT,
                Bookmark.target_id.in_(flight_ids),
            )
        )
        or 0
    )
    bookmarks_total = series_bookmarks + flight_bookmarks
    results_count = int(
        await session.scalar(
            select(func.count()).select_from(Result).where(Result.event_id.in_(event_ids))
        )
        or 0
    )
    if bookmarks_total or results_count:
        parts: list[str] = []
        if bookmarks_total:
            parts.append(f"{bookmarks_total} закладок")
        if results_count:
            parts.append(f"{results_count} результатов")
        raise ConflictError(f"Нельзя удалить: есть {', '.join(parts)}")

    await session.execute(
        update(ImportJob).where(ImportJob.series_id == series_id).values(series_id=None)
    )
    await session.delete(series)
    await session.flush()


async def list_series_events(
    session: AsyncSession,
    series_id: UUID,
) -> list[EventAdminRead]:
    series = await _get_series(session, series_id)
    stmt = (
        select(Event)
        .where(Event.series_id == series_id)
        .options(
            selectinload(Event.currency),
            selectinload(Event.flights),
            selectinload(Event.blind_levels),
        )
        .order_by(Event.number.asc().nulls_last(), Event.name.asc())
    )
    events = list(await session.scalars(stmt))
    venue_timezone = series.venue.timezone
    counts = await _event_flight_bookmarks_counts(session, [event.id for event in events])
    return [
        _event_admin_read(event, venue_timezone, bookmarks_count=counts.get(event.id, 0))
        for event in events
    ]


async def list_series_changes(
    session: AsyncSession,
    series_id: UUID,
    *,
    limit: int = 20,
) -> list[ChangeLogAdminRead]:
    await _get_series(session, series_id)
    event_ids = select(Event.id).where(Event.series_id == series_id)
    flight_ids = select(Flight.id).where(Flight.event_id.in_(event_ids))
    stmt = (
        select(ChangeLog, User)
        .outerjoin(User, User.id == ChangeLog.actor_id)
        .where(
            or_(
                (ChangeLog.entity_type == "series") & (ChangeLog.entity_id == series_id),
                (ChangeLog.entity_type == "event") & (ChangeLog.entity_id.in_(event_ids)),
                (ChangeLog.entity_type == "flight") & (ChangeLog.entity_id.in_(flight_ids)),
            )
        )
        .order_by(ChangeLog.created_at.desc())
        .limit(limit)
    )
    rows = await session.execute(stmt)
    return [_change_log_admin_read(entry, actor) for entry, actor in rows.all()]


async def list_event_changes(
    session: AsyncSession,
    event_id: UUID,
    *,
    limit: int = 50,
) -> list[ChangeLogListItem]:
    from app.services import admin_change_log as change_log_admin_service

    await _get_event(session, event_id)
    return await change_log_admin_service.list_event_changes(session, event_id, limit=limit)


async def create_event(
    session: AsyncSession,
    series_id: UUID,
    data: EventCreate,
    *,
    actor_id: UUID,
) -> EventAdminRead:
    from app.services import slugs as slugs_service

    series = await _get_series(session, series_id)
    await _ensure_currency(session, data.currency_code)
    await _assert_unique_event_number(session, series_id=series_id, number=data.number)
    _validate_reentry(
        reentry_unlimited=data.reentry_unlimited,
        reentry_count=data.reentry_count,
    )

    slug = await slugs_service.allocate_event_slug(
        session,
        series_id,
        number=data.number,
        name=data.name,
        preferred=data.slug,
    )

    event = Event(
        series_id=series_id,
        number=data.number,
        name=data.name,
        slug=slug,
        buyin=data.buyin,
        buyin_bounty=data.buyin_bounty,
        currency_code=data.currency_code,
        guarantee=data.guarantee,
        game_type=data.game_type,
        tags=data.tags,
        start_stack=data.start_stack,
        start_blinds=data.start_blinds,
        reentry_count=data.reentry_count,
        reentry_unlimited=data.reentry_unlimited,
        late_reg_level=data.late_reg_level,
        day_end_note=data.day_end_note,
        status=EventStatus.SCHEDULED,
        notes=data.notes,
    )
    session.add(event)
    await session.flush()
    await change_log_service.log_event_create(
        session,
        event=event,
        series_status=series.status,
        actor_id=actor_id,
    )
    event = await _get_event(session, event.id)
    return _event_admin_read(event, event.series.venue.timezone, bookmarks_count=0)


async def get_event(session: AsyncSession, event_id: UUID) -> EventAdminRead:
    event = await _get_event(session, event_id)
    bookmarks = await _event_flight_bookmarks_count(session, event.id)
    flight_counts = await _flight_bookmarks_counts(session, [flight.id for flight in event.flights])
    return _event_admin_read(
        event,
        event.series.venue.timezone,
        bookmarks_count=bookmarks,
        flight_bookmarks=flight_counts,
    )


async def _prepare_event_update(
    session: AsyncSession,
    event: Event,
    data: EventUpdate,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    series = event.series
    old_snapshot = change_log_service.event_snapshot(event)
    payload = data.model_dump(exclude_unset=True)

    if "currency_code" in payload:
        await _ensure_currency(session, payload["currency_code"])
    if "number" in payload:
        await _assert_unique_event_number(
            session,
            series_id=series.id,
            number=payload["number"],
            exclude_event_id=event.id,
        )

    reentry_unlimited = payload.get("reentry_unlimited", event.reentry_unlimited)
    reentry_count = payload.get("reentry_count", event.reentry_count)
    # If switching to unlimited, clear count unless explicitly provided.
    if payload.get("reentry_unlimited") is True and "reentry_count" not in payload:
        reentry_count = None
        payload["reentry_count"] = None
    _validate_reentry(reentry_unlimited=reentry_unlimited, reentry_count=reentry_count)

    proposed = _proposed_snapshot(old_snapshot, payload)
    return old_snapshot, proposed, payload


async def preview_event_update(
    session: AsyncSession,
    event_id: UUID,
    data: EventUpdate,
    *,
    actor_id: UUID,
) -> NotificationPreviewResponse:
    event = await _get_event(session, event_id)
    old_snapshot, proposed, _payload = await _prepare_event_update(session, event, data)
    body = data.model_dump(mode="json", exclude_unset=True)
    return await notification_previews_service.preview_event_update(
        session,
        event=event,
        old_snapshot=old_snapshot,
        new_snapshot=proposed,
        body=body,
        actor_id=actor_id,
        series_status=event.series.status,
    )


async def update_event(
    session: AsyncSession,
    event_id: UUID,
    data: EventUpdate,
    *,
    actor_id: UUID,
    preview_token: str | None = None,
    notify: bool = True,
) -> EventAdminRead:
    from app.services import slugs as slugs_service

    event = await _lock_event(session, event_id)
    series = event.series
    old_snapshot, proposed, payload = await _prepare_event_update(session, event, data)
    body = data.model_dump(mode="json", exclude_unset=True)
    new_slug = payload.pop("slug", None)

    if _published_would_log(
        series_status=series.status,
        old_snapshot=old_snapshot,
        new_snapshot=proposed,
    ):
        token = _require_preview_token(preview_token)
        _verify_confirm_token(
            preview_token=token,
            actor_id=actor_id,
            entity_type="event",
            entity_id=event.id,
            old_snapshot=old_snapshot,
            body=body,
        )

    for field, value in payload.items():
        setattr(event, field, value)
    if new_slug is not None:
        await slugs_service.change_event_slug(
            session,
            event,
            new_slug,
            series_slug=series.slug,
        )

    await session.flush()
    change_log = await change_log_service.log_event_update(
        session,
        event=event,
        old_snapshot=old_snapshot,
        series_status=series.status,
        actor_id=actor_id,
    )
    if change_log is not None:
        new_snapshot = change_log_service.event_snapshot(event)
        if notify:
            planned = change_notifications_service.plan_impacts_for_event_update(
                old_snapshot,
                new_snapshot,
                event,
            )
            await change_notifications_service.enqueue_planned_notifications(
                session,
                change_log=change_log,
                planned=planned,
            )
        if (
            event.status == EventStatus.CANCELLED
            and old_snapshot.get("status") != EventStatus.CANCELLED.value
        ):
            await notifications_service.cancel_pending_reminders_for_event(
                session,
                event_id=event.id,
            )
    event = await _get_event(session, event.id)
    bookmarks = await _event_flight_bookmarks_count(session, event.id)
    return _event_admin_read(
        event,
        event.series.venue.timezone,
        bookmarks_count=bookmarks,
    )


async def delete_event(
    session: AsyncSession,
    event_id: UUID,
    *,
    actor_id: UUID,
) -> None:
    del actor_id
    event = await _get_event(session, event_id)
    if event.series.status != SeriesStatus.ANNOUNCED:
        raise ConflictError("Published event cannot be hard-deleted; cancel via status instead")
    await session.delete(event)
    await session.flush()


async def duplicate_event(
    session: AsyncSession,
    event_id: UUID,
    *,
    actor_id: UUID,
) -> EventAdminRead:
    from app.services import slugs as slugs_service

    source = await _get_event(session, event_id)
    series = source.series
    copy_name = source.name
    if not copy_name.endswith(" (копия)"):
        copy_name = f"{copy_name} (копия)"

    event = Event(
        series_id=source.series_id,
        number=None,
        name=copy_name[:160],
        slug=await slugs_service.allocate_event_slug(
            session,
            source.series_id,
            number=None,
            name=copy_name[:160],
        ),
        buyin=source.buyin,
        currency_code=source.currency_code,
        guarantee=source.guarantee,
        game_type=source.game_type,
        tags=list(source.tags),
        start_stack=source.start_stack,
        start_blinds=source.start_blinds,
        reentry_count=source.reentry_count,
        reentry_unlimited=source.reentry_unlimited,
        late_reg_level=source.late_reg_level,
        status=EventStatus.SCHEDULED,
        notes=source.notes,
    )
    session.add(event)
    await session.flush()

    for flight in sorted(source.flights, key=lambda item: item.start_at):
        session.add(
            Flight(
                event_id=event.id,
                label=flight.label,
                start_at=flight.start_at,
            )
        )

    for level in sorted(
        source.blind_levels,
        key=lambda item: (item.structure_set_label or "default", item.level_no),
    ):
        session.add(
            BlindLevel(
                event_id=event.id,
                structure_set_label=level.structure_set_label or "default",
                level_no=level.level_no,
                sb=level.sb,
                bb=level.bb,
                ante=level.ante,
                minutes=level.minutes,
                is_break=level.is_break,
                is_late_reg_end=level.is_late_reg_end,
            )
        )

    await session.flush()
    await change_log_service.log_event_create(
        session,
        event=event,
        series_status=series.status,
        actor_id=actor_id,
    )
    return await get_event(session, event.id)


async def list_flights(session: AsyncSession, event_id: UUID) -> list[FlightAdminRead]:
    event = await _get_event(session, event_id)
    venue_timezone = event.series.venue.timezone
    flights = sorted(event.flights, key=lambda item: item.start_at)
    flight_counts = await _flight_bookmarks_counts(session, [flight.id for flight in flights])
    return [
        _flight_admin_read(
            flight,
            venue_timezone,
            bookmarks_count=flight_counts.get(flight.id, 0),
        )
        for flight in flights
    ]


async def _prepare_flights_replace(
    _session: AsyncSession,
    event: Event,
    items: list[FlightUpsert],
) -> tuple[
    dict[str, Any],
    list[tuple[FlightUpsert, datetime]],
    list[tuple[dict[str, Any], dict[str, Any], Flight]],
    set[UUID],
    bool,
]:
    series = event.series
    venue_timezone = series.venue.timezone
    published = change_log_service.is_series_published(series.status)
    converted = _validate_flights_payload(items, series=series, venue_timezone=venue_timezone)

    existing_by_id = {flight.id: flight for flight in event.flights}
    incoming_ids = {item.id for item, _ in converted if item.id is not None}
    unknown_ids = incoming_ids - set(existing_by_id)
    if unknown_ids:
        raise NotFoundError("One or more flights not found for this event")

    removed_ids = set(existing_by_id) - incoming_ids
    if removed_ids and published:
        raise ConflictError("Published flights cannot be removed")

    aggregate_old = _flights_aggregate_snapshot(list(event.flights))
    updates: list[tuple[dict[str, Any], dict[str, Any], Flight]] = []
    would_log = False

    for item, start_at_utc in converted:
        if item.id is None:
            if published:
                would_log = True
            continue
        flight = existing_by_id[item.id]
        old_snapshot = change_log_service.flight_snapshot(flight)
        new_snapshot = change_log_service.json_safe(
            {
                "event_id": event.id,
                "label": item.label,
                "start_at": start_at_utc,
            }
        )
        assert isinstance(new_snapshot, dict)
        updates.append((old_snapshot, new_snapshot, flight))
        if published and old_snapshot != new_snapshot:
            would_log = True

    if published and removed_ids:
        would_log = True

    return aggregate_old, converted, updates, removed_ids, would_log


async def preview_flights_replace(
    session: AsyncSession,
    event_id: UUID,
    items: list[FlightUpsert],
    *,
    actor_id: UUID,
) -> NotificationPreviewResponse:
    event = await _get_event(session, event_id)
    aggregate_old, converted, updates, _removed_ids, _would_log = await _prepare_flights_replace(
        session,
        event,
        items,
    )
    preview_updates = list(updates)
    for item, start_at_utc in converted:
        if item.id is not None:
            continue
        new_snapshot = change_log_service.json_safe(
            {
                "event_id": event.id,
                "label": item.label,
                "start_at": start_at_utc,
            }
        )
        assert isinstance(new_snapshot, dict)
        preview_updates.append(
            (
                {},
                new_snapshot,
                Flight(event_id=event.id, label=item.label, start_at=start_at_utc),
            )
        )

    body = [item.model_dump(mode="json") for item in items]
    return await notification_previews_service.preview_flight_updates(
        session,
        event=event,
        updates=preview_updates,
        body=body,
        actor_id=actor_id,
        series_status=event.series.status,
        aggregate_old_snapshot=aggregate_old,
    )


async def replace_flights(
    session: AsyncSession,
    event_id: UUID,
    items: list[FlightUpsert],
    *,
    actor_id: UUID,
    preview_token: str | None = None,
    notify: bool = True,
) -> list[FlightAdminRead]:
    event = await _lock_event(session, event_id)
    series = event.series
    venue_timezone = series.venue.timezone
    aggregate_old, converted, updates, removed_ids, would_log = await _prepare_flights_replace(
        session,
        event,
        items,
    )
    body = [item.model_dump(mode="json") for item in items]

    if would_log:
        token = _require_preview_token(preview_token)
        _verify_confirm_token(
            preview_token=token,
            actor_id=actor_id,
            entity_type="flight",
            entity_id=event.id,
            old_snapshot=aggregate_old,
            body=body,
        )

    existing_by_id = {flight.id: flight for flight in event.flights}
    for flight_id in removed_ids:
        await session.delete(existing_by_id[flight_id])

    change_logs: list[ChangeLog] = []
    applied_updates: list[tuple[dict[str, Any], dict[str, Any], Flight]] = []
    changed_start_flight_ids: list[UUID] = []

    for item, start_at_utc in converted:
        if item.id is None:
            flight = Flight(event_id=event.id, label=item.label, start_at=start_at_utc)
            session.add(flight)
            await session.flush()
            created_log = await change_log_service.log_flight_create(
                session,
                flight=flight,
                series_status=series.status,
                actor_id=actor_id,
            )
            if created_log is not None:
                change_logs.append(created_log)
        else:
            flight = existing_by_id[item.id]
            old_snapshot = change_log_service.flight_snapshot(flight)
            flight.label = item.label
            flight.start_at = start_at_utc
            await session.flush()
            new_snapshot = change_log_service.flight_snapshot(flight)
            applied_updates.append((old_snapshot, new_snapshot, flight))
            if old_snapshot.get("start_at") != new_snapshot.get("start_at"):
                changed_start_flight_ids.append(flight.id)
            updated_log = await change_log_service.log_flight_update(
                session,
                flight=flight,
                old_snapshot=old_snapshot,
                series_status=series.status,
                actor_id=actor_id,
            )
            if updated_log is not None:
                change_logs.append(updated_log)

    await session.flush()

    # Bump event.updated_at so PDF cache invalidates on flight-only edits.
    event.updated_at = datetime.now(UTC)
    await session.flush()

    if change_logs and notify:
        planned = change_notifications_service.plan_impacts_for_flight_updates(
            applied_updates,
            event,
        )
        await change_notifications_service.enqueue_planned_notifications(
            session,
            change_log=change_logs[0],
            planned=planned,
        )
        notified_at = change_logs[0].notified_at
        for entry in change_logs[1:]:
            entry.notified_at = notified_at

    for flight_id in changed_start_flight_ids:
        await notifications_service.reschedule_reminders_for_flight(
            session,
            flight_id=flight_id,
        )

    stmt = select(Flight).where(Flight.event_id == event_id).order_by(Flight.start_at.asc())
    flights = list(await session.scalars(stmt))
    flight_counts = await _flight_bookmarks_counts(session, [flight.id for flight in flights])
    return [
        _flight_admin_read(
            flight,
            venue_timezone,
            bookmarks_count=flight_counts.get(flight.id, 0),
        )
        for flight in flights
    ]


async def list_blind_levels(
    session: AsyncSession,
    event_id: UUID,
) -> list[BlindLevelAdminRead]:
    event = await _get_event(session, event_id)
    levels = sorted(
        event.blind_levels,
        key=lambda item: (item.structure_set_label or "default", item.level_no),
    )
    return [BlindLevelAdminRead.model_validate(level) for level in levels]


async def replace_blind_levels(
    session: AsyncSession,
    event_id: UUID,
    items: list[BlindLevelUpsert],
    *,
    actor_id: UUID,
) -> list[BlindLevelAdminRead]:
    event = await _get_event(session, event_id)
    series = event.series
    published = change_log_service.is_series_published(series.status)
    _validate_blind_levels_payload(items)

    old_levels = change_log_service.blind_levels_snapshot(list(event.blind_levels))
    existing_by_id = {level.id: level for level in event.blind_levels}
    incoming_ids = {item.id for item in items if item.id is not None}
    unknown_ids = incoming_ids - set(existing_by_id)
    if unknown_ids:
        raise NotFoundError("One or more blind levels not found for this event")

    removed_ids = set(existing_by_id) - incoming_ids
    if removed_ids and published:
        raise ConflictError("Published blind levels cannot be removed")

    for level_id in removed_ids:
        await session.delete(existing_by_id[level_id])

    for item in items:
        if item.id is None:
            session.add(
                BlindLevel(
                    event_id=event.id,
                    structure_set_label=item.structure_set_label or "default",
                    level_no=item.level_no,
                    sb=item.sb,
                    bb=item.bb,
                    ante=item.ante,
                    minutes=item.minutes,
                    is_break=item.is_break,
                    is_late_reg_end=item.is_late_reg_end,
                )
            )
        else:
            level = existing_by_id[item.id]
            level.structure_set_label = item.structure_set_label or "default"
            level.level_no = item.level_no
            level.sb = item.sb
            level.bb = item.bb
            level.ante = item.ante
            level.minutes = item.minutes
            level.is_break = item.is_break
            level.is_late_reg_end = item.is_late_reg_end

    await session.flush()
    event.updated_at = datetime.now(UTC)
    await session.flush()
    stmt = select(BlindLevel).where(BlindLevel.event_id == event_id)
    levels = list(await session.scalars(stmt))
    new_levels = change_log_service.blind_levels_snapshot(levels)
    await change_log_service.log_blind_levels_update(
        session,
        event_id=event.id,
        old_levels=old_levels,
        new_levels=new_levels,
        series_status=series.status,
        actor_id=actor_id,
    )
    ordered = sorted(
        levels, key=lambda item: (item.structure_set_label or "default", item.level_no)
    )
    return [BlindLevelAdminRead.model_validate(level) for level in ordered]
