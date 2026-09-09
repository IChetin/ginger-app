from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models.enums import SeriesStatus
from app.models.references import Organizer, Venue
from app.models.schedule import Event, Flight, Series
from app.schemas.search import (
    SearchEventItem,
    SearchGroup,
    SearchResponse,
    SearchSeriesItem,
    SearchVenueItem,
)
from app.schemas.schedule import DateTimeWithTimezone
from app.utils.timezone import to_venue_local

_PUBLISHED_SERIES_STATUSES = (
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
    SeriesStatus.FINISHED,
)

_SERIES_STATUS_RANK = case(
    (Series.status == SeriesStatus.RUNNING, 0),
    (Series.status == SeriesStatus.SCHEDULE_PUBLISHED, 1),
    (Series.status == SeriesStatus.ANNOUNCED, 2),
    (Series.status == SeriesStatus.FINISHED, 3),
    else_=4,
)


def _clamp_limit(value: int | None, default: int) -> int:
    if value is None:
        return default
    return max(1, min(20, value))


def _build_datetime(utc_dt: datetime, venue_timezone: str) -> DateTimeWithTimezone:
    return DateTimeWithTimezone(
        utc=utc_dt,
        venue_local=to_venue_local(utc_dt, venue_timezone),
        venue_timezone=venue_timezone,
    )


def _prefix_rank(*columns: object, pattern: str):
    return case(*[(column.ilike(pattern), 0) for column in columns], else_=1)


async def _count(session: AsyncSession, stmt: Select[tuple[UUID]]) -> int:
    return int(await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)


async def search(
    session: AsyncSession,
    *,
    q: str,
    limit: int = 5,
    series_limit: int | None = None,
    venues_limit: int | None = None,
    events_limit: int | None = None,
) -> SearchResponse:
    query = q.strip()
    if len(query) < 2:
        raise AppError("validation_error", "Query must be at least 2 characters", 400)

    series_cap = _clamp_limit(series_limit, limit)
    venues_cap = _clamp_limit(venues_limit, limit)
    events_cap = _clamp_limit(events_limit, limit)

    contains = f"%{query}%"
    prefix = f"{query}%"

    series_group = await _search_series(session, contains=contains, prefix=prefix, limit=series_cap)
    venues_group = await _search_venues(session, contains=contains, prefix=prefix, limit=venues_cap)
    events_group = await _search_events(session, contains=contains, prefix=prefix, limit=events_cap)

    return SearchResponse(
        q=query,
        series=series_group,
        venues=venues_group,
        events=events_group,
    )


async def _search_series(
    session: AsyncSession,
    *,
    contains: str,
    prefix: str,
    limit: int,
) -> SearchGroup[SearchSeriesItem]:
    match = or_(Series.name.ilike(contains), Organizer.name.ilike(contains))
    base = (
        select(Series.id)
        .join(Series.organizer)
        .where(Series.status != SeriesStatus.CANCELLED, match)
    )
    total = await _count(session, base)

    rank = _prefix_rank(Series.name, Organizer.name, pattern=prefix)
    rows = list(
        await session.scalars(
            select(Series)
            .join(Series.organizer)
            .join(Series.venue)
            .where(Series.status != SeriesStatus.CANCELLED, match)
            .options(selectinload(Series.organizer), selectinload(Series.venue))
            .order_by(rank.asc(), _SERIES_STATUS_RANK.asc(), Series.starts_on.desc(), Series.name.asc())
            .limit(limit)
        )
    )

    # events_count via separate query to avoid cartesian issues
    counts: dict[UUID, int] = {}
    if rows:
        count_rows = await session.execute(
            select(Event.series_id, func.count(Event.id))
            .where(Event.series_id.in_([row.id for row in rows]))
            .group_by(Event.series_id)
        )
        counts = {series_id: count for series_id, count in count_rows.all()}

    items = [
        SearchSeriesItem(
            id=row.id,
            slug=row.slug,
            name=row.name,
            status=row.status,
            starts_on=row.starts_on,
            ends_on=row.ends_on,
            venue_name=row.venue.name,
            venue_city=row.venue.city,
            organizer_name=row.organizer.name,
            organizer_slug=row.organizer.slug,
            events_count=counts.get(row.id, 0),
        )
        for row in rows
    ]
    return SearchGroup(items=items, total=total, has_more=total > len(items))


async def _search_venues(
    session: AsyncSession,
    *,
    contains: str,
    prefix: str,
    limit: int,
) -> SearchGroup[SearchVenueItem]:
    match = or_(Venue.name.ilike(contains), Venue.city.ilike(contains))
    base = select(Venue.id).where(match)
    total = await _count(session, base)

    series_count = (
        select(func.count(Series.id))
        .where(
            Series.venue_id == Venue.id,
            Series.status != SeriesStatus.CANCELLED,
        )
        .correlate(Venue)
        .scalar_subquery()
    )
    rank = _prefix_rank(Venue.name, Venue.city, pattern=prefix)
    rows = await session.execute(
        select(Venue, series_count.label("series_count"))
        .where(match)
        .order_by(rank.asc(), series_count.desc(), Venue.name.asc())
        .limit(limit)
    )
    items = [
        SearchVenueItem(
            id=venue.id,
            name=venue.name,
            city=venue.city,
            country_code=venue.country_code,
            zone=venue.zone,
            series_count=int(count or 0),
        )
        for venue, count in rows.all()
    ]
    return SearchGroup(items=items, total=total, has_more=total > len(items))


async def _search_events(
    session: AsyncSession,
    *,
    contains: str,
    prefix: str,
    limit: int,
) -> SearchGroup[SearchEventItem]:
    match = Event.name.ilike(contains)
    published = Series.status.in_(_PUBLISHED_SERIES_STATUSES)
    base = select(Event.id).join(Event.series).where(published, match)
    total = await _count(session, base)

    nearest_start = (
        select(func.min(Flight.start_at))
        .where(Flight.event_id == Event.id)
        .correlate(Event)
        .scalar_subquery()
    )
    now = datetime.now(UTC)
    future_rank = case((nearest_start >= now, 0), else_=1)
    rank = _prefix_rank(Event.name, pattern=prefix)

    rows = list(
        await session.scalars(
            select(Event)
            .join(Event.series)
            .join(Series.venue)
            .where(published, match)
            .options(
                selectinload(Event.series).selectinload(Series.venue),
                selectinload(Event.flights),
            )
            .order_by(
                rank.asc(),
                future_rank.asc(),
                nearest_start.asc().nulls_last(),
                Event.name.asc(),
            )
            .limit(limit)
        )
    )

    items: list[SearchEventItem] = []
    for event in rows:
        flights = sorted(event.flights, key=lambda item: item.start_at)
        nearest = flights[0] if flights else None
        timezone = event.series.venue.timezone
        items.append(
            SearchEventItem(
                id=event.id,
                slug=event.slug,
                number=event.number,
                name=event.name,
                series_id=event.series_id,
                series_slug=event.series.slug,
                series_name=event.series.name,
                buyin=event.buyin,
                currency_code=event.currency_code,
                nearest_start_at=(
                    _build_datetime(nearest.start_at, timezone) if nearest is not None else None
                ),
            )
        )
    return SearchGroup(items=items, total=total, has_more=total > len(items))
