from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models.auth import User
from app.models.enums import BookmarkTarget, SeriesStatus
from app.models.notifications import Bookmark
from app.models.schedule import Event, Flight, Series
from app.schemas.bookmarks import (
    BookmarkCreate,
    BookmarkDisplayFields,
    BookmarkMigrateResponse,
    BookmarkOverviewItem,
    BookmarkRead,
    BookmarkTargetResolveItem,
    BookmarkTargetResolveRef,
    BookmarkUpdate,
    GuestBookmarkItem,
    resolve_reminder_offsets,
)
from app.schemas.schedule import DateTimeWithTimezone
from app.services import notifications as notifications_service
from app.services.paths import event_canonical_path, series_canonical_path
from app.utils.timezone import to_venue_local

_PUBLISHED_SERIES = {
    SeriesStatus.ANNOUNCED,
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
    SeriesStatus.FINISHED,
}


async def list_bookmarks(session: AsyncSession, user: User) -> list[Bookmark]:
    result = await session.scalars(
        select(Bookmark).where(Bookmark.user_id == user.id).order_by(Bookmark.created_at.desc())
    )
    return list(result)


def _build_datetime(utc_dt: datetime, venue_timezone: str) -> DateTimeWithTimezone:
    return DateTimeWithTimezone(
        utc=utc_dt,
        venue_local=to_venue_local(utc_dt, venue_timezone),
        venue_timezone=venue_timezone,
    )


def _series_display_fields(
    series: Series,
    *,
    nearest: DateTimeWithTimezone | None,
) -> BookmarkDisplayFields:
    return BookmarkDisplayFields(
        series_id=series.id,
        event_id=None,
        series_name=series.name,
        series_status=series.status,
        series_starts_on=series.starts_on,
        series_ends_on=series.ends_on,
        organizer_name=series.organizer.name,
        organizer_slug=series.organizer.slug,
        venue_name=series.venue.name,
        venue_city=series.venue.city,
        event_number=None,
        event_name=None,
        flight_label=None,
        nearest_start_at=nearest,
        url=series_canonical_path(series),
    )


def _flight_display_fields(flight: Flight) -> BookmarkDisplayFields:
    event = flight.event
    series = event.series
    return BookmarkDisplayFields(
        series_id=series.id,
        event_id=event.id,
        series_name=series.name,
        series_status=series.status,
        series_starts_on=series.starts_on,
        series_ends_on=series.ends_on,
        organizer_name=series.organizer.name,
        organizer_slug=series.organizer.slug,
        venue_name=series.venue.name,
        venue_city=series.venue.city,
        event_number=event.number,
        event_name=event.name,
        flight_label=flight.label,
        nearest_start_at=_build_datetime(flight.start_at, series.venue.timezone),
        url=event_canonical_path(event, series_slug=series.slug),
    )


def _series_subtitle(series: Series) -> str:
    return f"{series.starts_on.isoformat()} – {series.ends_on.isoformat()} · {series.status.value}"


def _flight_subtitle(series: Series, flight: Flight) -> str:
    label_part = f" · {flight.label}" if flight.label else ""
    return f"{series.name}{label_part}"


def _nearest_series_start(series: Series, now: datetime) -> DateTimeWithTimezone | None:
    upcoming = [
        flight.start_at
        for event in series.events
        for flight in event.flights
        if flight.start_at >= now
    ]
    if not upcoming:
        return None
    return _build_datetime(min(upcoming), series.venue.timezone)


async def _load_series_map(session: AsyncSession, series_ids: list[UUID]) -> dict[UUID, Series]:
    if not series_ids:
        return {}
    series_rows = await session.scalars(
        select(Series)
        .where(Series.id.in_(series_ids))
        .options(
            selectinload(Series.venue),
            selectinload(Series.organizer),
            selectinload(Series.events).selectinload(Event.flights),
        )
    )
    return {row.id: row for row in series_rows}


async def _load_flight_map(session: AsyncSession, flight_ids: list[UUID]) -> dict[UUID, Flight]:
    if not flight_ids:
        return {}
    flight_rows = await session.scalars(
        select(Flight)
        .where(Flight.id.in_(flight_ids))
        .options(
            selectinload(Flight.event).selectinload(Event.series).selectinload(Series.venue),
            selectinload(Flight.event).selectinload(Event.series).selectinload(Series.organizer),
        )
    )
    return {row.id: row for row in flight_rows}


async def list_bookmarks_overview(
    session: AsyncSession,
    user: User,
) -> list[BookmarkOverviewItem]:
    bookmarks = await list_bookmarks(session, user)
    if not bookmarks:
        return []

    series_ids = [b.target_id for b in bookmarks if b.target_type == BookmarkTarget.SERIES]
    flight_ids = [b.target_id for b in bookmarks if b.target_type == BookmarkTarget.FLIGHT]
    series_by_id = await _load_series_map(session, series_ids)
    flight_by_id = await _load_flight_map(session, flight_ids)

    now = datetime.now(UTC)
    items: list[BookmarkOverviewItem] = []

    for bookmark in bookmarks:
        if bookmark.target_type == BookmarkTarget.SERIES:
            series = series_by_id.get(bookmark.target_id)
            if series is None:
                continue
            nearest = _nearest_series_start(series, now)
            fields = _series_display_fields(series, nearest=nearest)
            items.append(
                BookmarkOverviewItem(
                    id=bookmark.id,
                    target_type=bookmark.target_type,
                    target_id=bookmark.target_id,
                    reminder_offsets=list(bookmark.reminder_offsets),
                    created_at=bookmark.created_at,
                    title=series.name,
                    subtitle=_series_subtitle(series),
                    **fields.model_dump(),
                )
            )
            continue

        flight = flight_by_id.get(bookmark.target_id)
        if flight is None:
            continue
        event = flight.event
        series = event.series
        fields = _flight_display_fields(flight)
        items.append(
            BookmarkOverviewItem(
                id=bookmark.id,
                target_type=bookmark.target_type,
                target_id=bookmark.target_id,
                reminder_offsets=list(bookmark.reminder_offsets),
                created_at=bookmark.created_at,
                title=event.name,
                subtitle=_flight_subtitle(series, flight),
                **fields.model_dump(),
            )
        )

    far_future = datetime.max.replace(tzinfo=UTC)

    def _sort_key(item: BookmarkOverviewItem) -> tuple[bool, datetime, float]:
        nearest = item.nearest_start_at.utc if item.nearest_start_at is not None else far_future
        return (item.nearest_start_at is None, nearest, -item.created_at.timestamp())

    items.sort(key=_sort_key)
    return items


async def resolve_bookmark_targets(
    session: AsyncSession,
    refs: list[BookmarkTargetResolveRef],
) -> list[BookmarkTargetResolveItem]:
    """Public batch hydrate for guest IndexedDB target ids (no user data)."""
    if not refs:
        return []

    # Preserve request order; dedupe loads.
    series_ids = [ref.target_id for ref in refs if ref.target_type == BookmarkTarget.SERIES]
    flight_ids = [ref.target_id for ref in refs if ref.target_type == BookmarkTarget.FLIGHT]
    series_by_id = await _load_series_map(session, series_ids)
    flight_by_id = await _load_flight_map(session, flight_ids)
    now = datetime.now(UTC)

    items: list[BookmarkTargetResolveItem] = []
    for ref in refs:
        if ref.target_type == BookmarkTarget.SERIES:
            series = series_by_id.get(ref.target_id)
            if series is None or series.status not in _PUBLISHED_SERIES:
                items.append(
                    BookmarkTargetResolveItem(
                        target_type=ref.target_type,
                        target_id=ref.target_id,
                        found=False,
                        display=None,
                    )
                )
                continue
            nearest = _nearest_series_start(series, now)
            items.append(
                BookmarkTargetResolveItem(
                    target_type=ref.target_type,
                    target_id=ref.target_id,
                    found=True,
                    display=_series_display_fields(series, nearest=nearest),
                )
            )
            continue

        flight = flight_by_id.get(ref.target_id)
        if flight is None or flight.event.series.status not in _PUBLISHED_SERIES:
            items.append(
                BookmarkTargetResolveItem(
                    target_type=ref.target_type,
                    target_id=ref.target_id,
                    found=False,
                    display=None,
                )
            )
            continue
        items.append(
            BookmarkTargetResolveItem(
                target_type=ref.target_type,
                target_id=ref.target_id,
                found=True,
                display=_flight_display_fields(flight),
            )
        )
    return items


async def get_user_bookmark(
    session: AsyncSession,
    user: User,
    bookmark_id: UUID,
) -> Bookmark:
    bookmark = await session.scalar(
        select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == user.id)
    )
    if bookmark is None:
        raise NotFoundError("Bookmark not found")
    return bookmark


async def _ensure_target_exists(
    session: AsyncSession,
    *,
    target_type: BookmarkTarget,
    target_id: UUID,
) -> None:
    if target_type == BookmarkTarget.SERIES:
        series = await notifications_service.load_series(session, target_id)
        if series is None or series.status not in _PUBLISHED_SERIES:
            raise NotFoundError("Series not found")
        return

    flight = await notifications_service.load_flight(session, target_id)
    if flight is None:
        raise NotFoundError("Flight not found")
    if flight.event.series.status not in _PUBLISHED_SERIES:
        raise NotFoundError("Flight not found")


async def _published_target_ids(
    session: AsyncSession,
    *,
    series_ids: set[UUID],
    flight_ids: set[UUID],
) -> tuple[set[UUID], set[UUID]]:
    valid_series: set[UUID] = set()
    if series_ids:
        valid_series = set(
            await session.scalars(
                select(Series.id).where(
                    Series.id.in_(series_ids),
                    Series.status.in_(_PUBLISHED_SERIES),
                )
            )
        )

    valid_flights: set[UUID] = set()
    if flight_ids:
        rows = await session.scalars(
            select(Flight)
            .where(Flight.id.in_(flight_ids))
            .options(selectinload(Flight.event).selectinload(Event.series))
        )
        for flight in rows:
            if flight.event.series.status in _PUBLISHED_SERIES:
                valid_flights.add(flight.id)

    return valid_series, valid_flights


async def create_bookmark(
    session: AsyncSession,
    user: User,
    body: BookmarkCreate,
) -> Bookmark:
    await _ensure_target_exists(
        session,
        target_type=body.target_type,
        target_id=body.target_id,
    )

    existing = await session.scalar(
        select(Bookmark).where(
            Bookmark.user_id == user.id,
            Bookmark.target_type == body.target_type,
            Bookmark.target_id == body.target_id,
        )
    )
    if existing is not None:
        raise ConflictError("Bookmark already exists")

    offsets = resolve_reminder_offsets(
        body.target_type,
        body.reminder_offsets,
        profile_defaults=list(user.default_reminder_offsets),
    )
    bookmark = Bookmark(
        user_id=user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        reminder_offsets=offsets,
    )
    session.add(bookmark)
    await session.flush()
    if bookmark.target_type == BookmarkTarget.SERIES:
        await notifications_service.schedule_series_starting(session, bookmark=bookmark)
    else:
        await notifications_service.schedule_flight_reminders(session, bookmark=bookmark)
    return bookmark


async def update_bookmark(
    session: AsyncSession,
    user: User,
    bookmark_id: UUID,
    body: BookmarkUpdate,
) -> Bookmark:
    bookmark = await get_user_bookmark(session, user, bookmark_id)
    offsets = resolve_reminder_offsets(
        bookmark.target_type,
        body.reminder_offsets,
        profile_defaults=list(user.default_reminder_offsets),
    )
    bookmark.reminder_offsets = offsets
    await session.flush()
    await notifications_service.schedule_flight_reminders(session, bookmark=bookmark)
    return bookmark


async def delete_bookmark(
    session: AsyncSession,
    user: User,
    bookmark_id: UUID,
) -> None:
    bookmark = await get_user_bookmark(session, user, bookmark_id)
    await notifications_service.cancel_all_pending_for_bookmark(
        session,
        bookmark_id=bookmark.id,
    )
    await session.delete(bookmark)
    await session.flush()


async def migrate_bookmarks(
    session: AsyncSession,
    user: User,
    items: list[GuestBookmarkItem],
) -> BookmarkMigrateResponse:
    created = 0
    skipped = 0
    result_items: list[Bookmark] = []

    existing_rows = list(await session.scalars(select(Bookmark).where(Bookmark.user_id == user.id)))
    existing_map = {(row.target_type, row.target_id): row for row in existing_rows}

    series_ids = {item.target_id for item in items if item.target_type == BookmarkTarget.SERIES}
    flight_ids = {item.target_id for item in items if item.target_type == BookmarkTarget.FLIGHT}
    valid_series, valid_flights = await _published_target_ids(
        session,
        series_ids=series_ids,
        flight_ids=flight_ids,
    )

    for item in items:
        existing = existing_map.get((item.target_type, item.target_id))
        if existing is not None:
            skipped += 1
            result_items.append(existing)
            continue

        if item.target_type == BookmarkTarget.SERIES:
            if item.target_id not in valid_series:
                skipped += 1
                continue
        elif item.target_id not in valid_flights:
            skipped += 1
            continue

        offsets = resolve_reminder_offsets(
            item.target_type,
            item.reminder_offsets,
            profile_defaults=list(user.default_reminder_offsets),
        )
        bookmark = Bookmark(
            user_id=user.id,
            target_type=item.target_type,
            target_id=item.target_id,
            reminder_offsets=offsets,
        )
        session.add(bookmark)
        await session.flush()
        if bookmark.target_type == BookmarkTarget.SERIES:
            await notifications_service.schedule_series_starting(session, bookmark=bookmark)
        else:
            await notifications_service.schedule_flight_reminders(session, bookmark=bookmark)
        created += 1
        result_items.append(bookmark)
        existing_map[(bookmark.target_type, bookmark.target_id)] = bookmark

    return BookmarkMigrateResponse(
        created=created,
        skipped=skipped,
        items=[BookmarkRead.model_validate(item) for item in result_items],
    )
