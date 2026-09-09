from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Select, distinct, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.enums import BookmarkTarget, GameType, SeriesStatus
from app.models.notifications import Bookmark
from app.models.references import Country, Currency, Organizer, Venue
from app.models.schedule import Event, Flight, Series
from app.schemas.schedule import (
    BlindLevelRead,
    CalendarDay,
    CalendarQuery,
    CalendarResponse,
    CalendarSeriesItem,
    CalendarSeriesMarker,
    CountryBrief,
    CurrencyBrief,
    DateTimeWithTimezone,
    EventDetail,
    EventsDayGroup,
    EventSummary,
    FilterFacetCount,
    FlightRead,
    MinBuyinByCurrency,
    OrganizerBrief,
    ScheduleFilterCountsResponse,
    ScheduleFiltersResponse,
    SeriesDetail,
    SeriesHighlight,
    SeriesListItem,
    SeriesListQuery,
    SeriesListResponse,
    SeriesTabCounts,
    VenueBrief,
)
from app.services.organizer_logo import organizer_logo_url
from app.utils.timezone import to_venue_local, venue_local_date

DEFAULT_FEED_STATUSES = (
    SeriesStatus.ANNOUNCED,
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
    SeriesStatus.CANCELLED,
)

ACTUAL_FEED_STATUSES = (
    SeriesStatus.ANNOUNCED,
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
)

LIVE_SOON_STATUSES = (
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
)

STATUS_ACTUAL = "actual"
STATUS_LIVE_SOON = "live_soon"
STATUS_UPCOMING = "upcoming"
# Home segments «Идут» / «Анонсы» reuse SeriesStatus string values with date semantics
# (aligned with frontend effectiveSeriesPhase), not exact DB enum alone.
STATUS_RUNNING = SeriesStatus.RUNNING.value
STATUS_ANNOUNCED = SeriesStatus.ANNOUNCED.value


def parse_calendar_month(month: str) -> tuple[int, int]:
    year_str, month_str = month.split("-", 1)
    year = int(year_str)
    month_num = int(month_str)
    if month_num < 1 or month_num > 12:
        raise AppError(
            "validation_error",
            "month must be between 1 and 12",
            status_code=422,
        )
    return year, month_num


def _add_calendar_months(value: date, months: int) -> date:
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def normalize_calendar_period(from_date: date, to_date: date) -> tuple[date, date]:
    start, end = (from_date, to_date) if from_date <= to_date else (to_date, from_date)
    if end > _add_calendar_months(start, 6):
        raise AppError(
            "period_too_long",
            "Period must not exceed 6 months",
            status_code=422,
        )
    return start, end


def _events_in_period(
    events: list[Event],
    venue_timezone: str,
    *,
    period_start: date,
    period_end: date,
) -> list[Event]:
    matched: list[Event] = []
    for event in events:
        if not event.flights:
            continue
        if any(
            period_start <= venue_local_date(flight.start_at, venue_timezone) <= period_end
            for flight in event.flights
        ):
            matched.append(event)
    return matched


def _period_fields_for_series(
    series: Series,
    *,
    period_start: date,
    period_end: date,
) -> dict[str, object]:
    overlap_start = max(series.starts_on, period_start)
    overlap_end = min(series.ends_on, period_end)
    coverage = (
        "full" if series.starts_on >= period_start and series.ends_on <= period_end else "partial"
    )
    in_period = _events_in_period(
        list(series.events),
        series.venue.timezone,
        period_start=period_start,
        period_end=period_end,
    )
    return {
        "coverage": coverage,
        "overlap_starts_on": overlap_start,
        "overlap_ends_on": overlap_end,
        "events_in_period": len(in_period),
        "min_buyins_in_period": _min_buyins_from_events(in_period),
    }


async def _bookmarked_series_ids_for_user(
    session: AsyncSession,
    user_id: UUID,
    series_ids: list[UUID],
) -> set[UUID]:
    if not series_ids:
        return set()

    direct = set(
        await session.scalars(
            select(Bookmark.target_id).where(
                Bookmark.user_id == user_id,
                Bookmark.target_type == BookmarkTarget.SERIES,
                Bookmark.target_id.in_(series_ids),
            )
        )
    )

    via_flights = set(
        await session.scalars(
            select(Event.series_id)
            .join(Flight, Flight.event_id == Event.id)
            .join(
                Bookmark,
                (Bookmark.target_id == Flight.id)
                & (Bookmark.target_type == BookmarkTarget.FLIGHT)
                & (Bookmark.user_id == user_id),
            )
            .where(Event.series_id.in_(series_ids))
            .distinct()
        )
    )

    return direct | via_flights


def _days_until_start(starts_on: date, today: date | None = None) -> int | None:
    current = today or date.today()
    delta = (starts_on - current).days
    return delta if delta >= 0 else None


def _build_datetime(utc_dt: datetime, venue_timezone: str) -> DateTimeWithTimezone:
    return DateTimeWithTimezone(
        utc=utc_dt,
        venue_local=to_venue_local(utc_dt, venue_timezone),
        venue_timezone=venue_timezone,
    )


def _flight_read(flight: Flight, venue_timezone: str) -> FlightRead:
    return FlightRead(
        id=flight.id,
        label=flight.label,
        start_at=_build_datetime(flight.start_at, venue_timezone),
    )


def _venue_brief(venue: Venue) -> VenueBrief:
    return VenueBrief(
        id=venue.id,
        name=venue.name,
        city=venue.city,
        country_code=venue.country_code,
        zone=venue.zone,
        timezone=venue.timezone,
        address=venue.address,
    )


def _country_brief(country: Country) -> CountryBrief:
    return CountryBrief(code=country.code, name_ru=country.name_ru)


def _organizer_brief(organizer: Organizer) -> OrganizerBrief:
    return OrganizerBrief(
        id=organizer.id,
        name=organizer.name,
        slug=organizer.slug,
        logo_url=organizer_logo_url(organizer),
    )


def _series_highlight_for_events(
    events: list[Event],
    venue_timezone: str,
    *,
    today: date,
) -> SeriesHighlight | None:
    """Nearest main-tagged event with first flight on/after today (venue TZ)."""
    best: tuple[date, str] | None = None
    for event in events:
        if "main" not in (event.tags or []):
            continue
        if not event.flights:
            continue
        first_day = min(
            venue_local_date(flight.start_at, venue_timezone) for flight in event.flights
        )
        if first_day < today:
            continue
        if best is None or first_day < best[0] or (first_day == best[0] and event.name < best[1]):
            best = (first_day, event.name)
    if best is None:
        return None
    return SeriesHighlight(name=best[1], date=best[0])


def _today_events_count(
    events: list[Event],
    venue_timezone: str,
    *,
    today: date,
) -> int:
    count = 0
    for event in events:
        if any(
            venue_local_date(flight.start_at, venue_timezone) == today for flight in event.flights
        ):
            count += 1
    return count


async def _load_running_card_stats(
    session: AsyncSession,
    series_list: list[Series],
) -> dict[UUID, tuple[int, SeriesHighlight | None]]:
    """today_events_count + highlight for series whose dates cover «today» (venue TZ)."""
    candidates: list[Series] = []
    for item in series_list:
        if item.status == SeriesStatus.CANCELLED:
            continue
        venue_tz = item.venue.timezone
        today = datetime.now(tz=ZoneInfo(venue_tz)).date()
        if item.starts_on <= today <= item.ends_on:
            candidates.append(item)
    if not candidates:
        return {}

    series_ids = [item.id for item in candidates]
    tz_by_series = {item.id: item.venue.timezone for item in candidates}

    rows = await session.execute(
        select(Event).where(Event.series_id.in_(series_ids)).options(selectinload(Event.flights))
    )
    events = list(rows.scalars().unique().all())
    by_series: dict[UUID, list[Event]] = {series_id: [] for series_id in series_ids}
    for event in events:
        by_series.setdefault(event.series_id, []).append(event)

    result: dict[UUID, tuple[int, SeriesHighlight | None]] = {}
    for series in candidates:
        venue_tz = tz_by_series[series.id]
        today = datetime.now(tz=ZoneInfo(venue_tz)).date()
        series_events = by_series.get(series.id, [])
        result[series.id] = (
            _today_events_count(series_events, venue_tz, today=today),
            _series_highlight_for_events(series_events, venue_tz, today=today),
        )
    return result


def _currency_brief(event: Event) -> CurrencyBrief:
    return CurrencyBrief(code=event.currency.code, symbol=event.currency.symbol)


def _resolve_status_filter(status: str | SeriesStatus | None) -> tuple[SeriesStatus, ...] | None:
    """Return statuses to include, or None when a single exact status is already applied."""
    if status is None:
        return DEFAULT_FEED_STATUSES
    if isinstance(status, SeriesStatus):
        return (status,)
    if status == STATUS_ACTUAL:
        return ACTUAL_FEED_STATUSES
    if status in (STATUS_LIVE_SOON, STATUS_UPCOMING):
        return LIVE_SOON_STATUSES
    # Home «Идут»: any non-finished actual series whose dates cover today.
    if status == STATUS_RUNNING:
        return ACTUAL_FEED_STATUSES
    try:
        return (SeriesStatus(status),)
    except ValueError as exc:
        raise AppError(
            "validation_error",
            f"Invalid status: {status}",
            status_code=422,
        ) from exc


def _feed_excludes_past_by_date(status: str | SeriesStatus | None) -> bool:
    """Home «actual» / «live_soon» / default must not list series whose ends_on is past."""
    if status is None:
        return True
    if isinstance(status, SeriesStatus):
        return False
    return status in (STATUS_ACTUAL, STATUS_LIVE_SOON, STATUS_UPCOMING, STATUS_RUNNING)


def _feed_requires_date_overlap(status: str | SeriesStatus | None) -> bool:
    """Home «Идут»: starts_on ≤ today ≤ ends_on (server date)."""
    return status == STATUS_RUNNING


def _feed_requires_future_start(status: str | SeriesStatus | None) -> bool:
    """Home «Анонсы»: announced and not yet started (starts_on > today)."""
    return status == STATUS_ANNOUNCED


def _resolved_country_codes(
    country_code: str | None,
    country_codes: list[str] | None,
) -> list[str] | None:
    codes: list[str] = []
    if country_codes:
        codes.extend(code.upper() for code in country_codes)
    if country_code:
        codes.append(country_code.upper())
    uniq = list(dict.fromkeys(codes))
    return uniq or None


def _resolved_organizer_ids(
    organizer_id: UUID | None,
    organizer_ids: list[UUID] | None,
) -> list[UUID] | None:
    ids: list[UUID] = []
    if organizer_ids:
        ids.extend(organizer_ids)
    if organizer_id:
        ids.append(organizer_id)
    uniq = list(dict.fromkeys(ids))
    return uniq or None


def _amount_in_legacy_range(
    amount: Decimal,
    buyin_min: Decimal | None,
    buyin_max: Decimal | None,
) -> bool:
    if buyin_min is not None and amount < buyin_min:
        return False
    if buyin_max is not None and amount > buyin_max:
        return False
    return True


async def _series_ids_matching_buyin(
    session: AsyncSession,
    *,
    series_ids: list[UUID],
    buyin_presets: list[str] | None,
    buyin_min: Decimal | None,
    buyin_max: Decimal | None,
    base_currency: str,
) -> set[UUID]:
    """Filter series that have at least one event whose buy-in (in base currency) matches."""
    from app.services.buyin_presets import amount_matches_presets, parse_buyin_presets
    from app.services.fx import FxRateMissingError, convert_amount, load_rate_map

    if not series_ids:
        return set()

    presets = parse_buyin_presets(buyin_presets)
    use_presets = bool(presets)
    use_legacy = buyin_min is not None or buyin_max is not None
    if not use_presets and not use_legacy:
        return set(series_ids)

    rows = await session.execute(
        select(Event.series_id, Event.buyin, Event.currency_code, Series.starts_on)
        .join(Series, Series.id == Event.series_id)
        .where(Event.series_id.in_(series_ids))
    )
    event_rows = list(rows.all())
    if not event_rows:
        return set()

    codes = {currency for _, _, currency, _ in event_rows} | {base_currency}
    dates = [starts_on for *_, starts_on in event_rows]
    rate_map = await load_rate_map(
        session,
        currency_codes=codes,
        date_from=min(dates),
        date_to=max(dates),
    )

    matched: set[UUID] = set()
    for series_id, buyin, currency_code, starts_on in event_rows:
        if series_id in matched:
            continue
        try:
            amount = convert_amount(
                buyin,
                source_currency=currency_code,
                base_currency=base_currency,
                played_on=starts_on,
                rate_map=rate_map,
            )
        except FxRateMissingError:
            continue
        if use_presets and amount_matches_presets(amount, presets):
            matched.add(series_id)
            continue
        if use_legacy and not use_presets and _amount_in_legacy_range(amount, buyin_min, buyin_max):
            matched.add(series_id)
    return matched


def _min_buyins_from_events(events: list[Event]) -> list[MinBuyinByCurrency]:
    by_code: dict[str, MinBuyinByCurrency] = {}
    for event in events:
        # buyin 0 = freeroll / unknown placeholder — not a floor for "от X".
        if event.buyin <= 0:
            continue
        code = event.currency.code
        existing = by_code.get(code)
        if existing is None or event.buyin < existing.amount:
            by_code[code] = MinBuyinByCurrency(
                amount=event.buyin,
                currency=CurrencyBrief(code=code, symbol=event.currency.symbol),
            )
    return sorted(by_code.values(), key=lambda item: item.currency.code)


def _card_stats_kwargs(series: Series) -> dict[str, int | SeriesHighlight | None]:
    if series.status == SeriesStatus.CANCELLED:
        return {"today_events_count": None, "highlight": None}
    venue_tz = series.venue.timezone
    today = datetime.now(tz=ZoneInfo(venue_tz)).date()
    if not (series.starts_on <= today <= series.ends_on):
        return {"today_events_count": None, "highlight": None}
    events = list(series.events)
    return {
        "today_events_count": _today_events_count(events, venue_tz, today=today),
        "highlight": _series_highlight_for_events(events, venue_tz, today=today),
    }


def _series_list_item(
    series: Series,
    events_count: int,
    min_buyins: list[MinBuyinByCurrency] | None = None,
    *,
    today_events_count: int | None = None,
    highlight: SeriesHighlight | None = None,
) -> SeriesListItem:
    return SeriesListItem(
        id=series.id,
        slug=series.slug,
        name=series.name,
        starts_on=series.starts_on,
        ends_on=series.ends_on,
        status=series.status,
        poster_url=series.poster_url,
        organizer=_organizer_brief(series.organizer),
        venue=_venue_brief(series.venue),
        country=_country_brief(series.venue.country),
        events_count=events_count,
        days_until_start=_days_until_start(series.starts_on),
        min_buyins=min_buyins if min_buyins is not None else [],
        today_events_count=today_events_count,
        highlight=highlight,
    )


def _event_summary(event: Event, flights: list[Flight], venue_timezone: str) -> EventSummary:
    ordered = sorted(flights, key=lambda item: item.start_at)
    return EventSummary(
        id=event.id,
        slug=event.slug,
        number=event.number,
        name=event.name,
        buyin=event.buyin,
        buyin_bounty=event.buyin_bounty,
        currency=_currency_brief(event),
        guarantee=event.guarantee,
        game_type=event.game_type,
        tags=list(event.tags),
        status=event.status,
        start_stack=event.start_stack,
        start_blinds=event.start_blinds,
        reentry_count=event.reentry_count,
        reentry_unlimited=event.reentry_unlimited,
        late_reg_level=event.late_reg_level,
        day_end_note=event.day_end_note,
        flights=[_flight_read(flight, venue_timezone) for flight in ordered],
    )


def _apply_series_filters(
    stmt: Select[tuple[Series]],
    *,
    country_code: str | None = None,
    country_codes: list[str] | None = None,
    zone: str | None = None,
    organizer_id: UUID | None = None,
    organizer_ids: list[UUID] | None = None,
    venue_ids: list[UUID] | None = None,
    status: str | SeriesStatus | None = None,
    starts_from: date | None = None,
    starts_to: date | None = None,
    game_type: GameType | None = None,
    tags: list[str] | None = None,
    series_id_whitelist: set[UUID] | None = None,
) -> Select[tuple[Series]]:
    stmt = stmt.join(Series.venue).join(Venue.country).join(Series.organizer)

    statuses = _resolve_status_filter(status)
    if statuses is not None:
        if len(statuses) == 1:
            stmt = stmt.where(Series.status == statuses[0])
        else:
            stmt = stmt.where(Series.status.in_(statuses))

    today = date.today()
    if _feed_excludes_past_by_date(status):
        stmt = stmt.where(Series.ends_on >= today)

    if _feed_requires_date_overlap(status):
        stmt = stmt.where(Series.starts_on <= today, Series.ends_on >= today)

    if _feed_requires_future_start(status):
        stmt = stmt.where(Series.starts_on > today)

    countries = _resolved_country_codes(country_code, country_codes)
    if countries is not None:
        if len(countries) == 1:
            stmt = stmt.where(Venue.country_code == countries[0])
        else:
            stmt = stmt.where(Venue.country_code.in_(countries))

    if zone is not None:
        stmt = stmt.where(Venue.zone == zone)

    organizers = _resolved_organizer_ids(organizer_id, organizer_ids)
    if organizers is not None:
        if len(organizers) == 1:
            stmt = stmt.where(Series.organizer_id == organizers[0])
        else:
            stmt = stmt.where(Series.organizer_id.in_(organizers))

    if venue_ids is not None:
        if len(venue_ids) == 1:
            stmt = stmt.where(Series.venue_id == venue_ids[0])
        else:
            stmt = stmt.where(Series.venue_id.in_(venue_ids))

    if starts_from is not None:
        stmt = stmt.where(Series.ends_on >= starts_from)
    if starts_to is not None:
        stmt = stmt.where(Series.starts_on <= starts_to)

    if series_id_whitelist is not None:
        if not series_id_whitelist:
            stmt = stmt.where(Series.id.in_([]))
        else:
            stmt = stmt.where(Series.id.in_(series_id_whitelist))

    event_filters: list[ColumnElement[bool]] = []
    if game_type is not None:
        event_filters.append(Event.game_type == game_type)
    if tags:
        event_filters.append(Event.tags.overlap(tags))

    if event_filters:
        event_exists = exists(select(Event.id).where(Event.series_id == Series.id, *event_filters))
        stmt = stmt.where(event_exists)

    return stmt


async def _buyin_whitelist_for_query(
    session: AsyncSession,
    query: SeriesListQuery,
    candidate_ids: list[UUID],
) -> set[UUID] | None:
    """Return series-id whitelist for buy-in filters, or None when buy-in is not applied."""
    presets = query.buyin_presets or []
    if not presets and query.buyin_min is None and query.buyin_max is None:
        return None
    return await _series_ids_matching_buyin(
        session,
        series_ids=candidate_ids,
        buyin_presets=presets,
        buyin_min=query.buyin_min,
        buyin_max=query.buyin_max,
        base_currency=query.base_currency,
    )


async def _load_min_buyins(
    session: AsyncSession,
    series_ids: list[UUID],
) -> dict[UUID, list[MinBuyinByCurrency]]:
    if not series_ids:
        return {}

    rows = await session.execute(
        select(
            Event.series_id,
            Currency.code,
            Currency.symbol,
            func.min(Event.buyin),
        )
        .join(Currency, Currency.code == Event.currency_code)
        .where(Event.series_id.in_(series_ids), Event.buyin > 0)
        .group_by(Event.series_id, Currency.code, Currency.symbol)
        .order_by(Event.series_id.asc(), Currency.code.asc())
    )

    result: dict[UUID, list[MinBuyinByCurrency]] = {series_id: [] for series_id in series_ids}
    for series_id, code, symbol, amount in rows.all():
        result[series_id].append(
            MinBuyinByCurrency(
                amount=amount,
                currency=CurrencyBrief(code=code, symbol=symbol),
            )
        )
    return result


def _apply_query_filters(
    stmt: Select[tuple[Series]],
    query: SeriesListQuery,
    *,
    series_id_whitelist: set[UUID] | None = None,
) -> Select[tuple[Series]]:
    return _apply_series_filters(
        stmt,
        country_code=query.country_code,
        country_codes=query.country_codes,
        zone=query.zone,
        organizer_id=query.organizer_id,
        organizer_ids=query.organizer_ids,
        venue_ids=query.venue_ids,
        status=query.status,
        starts_from=query.starts_from,
        starts_to=query.starts_to,
        game_type=query.game_type,
        tags=query.tags,
        series_id_whitelist=series_id_whitelist,
    )


async def _filtered_series_base(
    session: AsyncSession,
    query: SeriesListQuery,
) -> Select[tuple[Series]]:
    prefilter = _apply_query_filters(select(Series.id), query)
    candidate_ids = cast(list[UUID], list(await session.scalars(prefilter)))
    buyin_whitelist = await _buyin_whitelist_for_query(session, query, candidate_ids)
    return _apply_query_filters(select(Series), query, series_id_whitelist=buyin_whitelist)


async def _count_matching_series(session: AsyncSession, query: SeriesListQuery) -> int:
    base = await _filtered_series_base(session, query)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    return total or 0


def _home_tab_for_status(status: str | None) -> str | None:
    if status == STATUS_ACTUAL:
        return "all"
    if status == STATUS_RUNNING:
        return "running"
    if status == SeriesStatus.FINISHED.value:
        return "archive"
    return None


async def _series_tab_counts(
    session: AsyncSession,
    query: SeriesListQuery,
    *,
    current_total: int | None = None,
) -> SeriesTabCounts:
    """Count home tabs with the same subject filters; reuse current total when it matches a tab."""
    tab_status = {
        "all": STATUS_ACTUAL,
        "running": STATUS_RUNNING,
        "archive": SeriesStatus.FINISHED.value,
    }
    current_tab = _home_tab_for_status(query.status)
    values: dict[str, int] = {}
    for key, status in tab_status.items():
        if key == current_tab and current_total is not None:
            values[key] = current_total
            continue
        values[key] = await _count_matching_series(
            session,
            query.model_copy(update={"status": status}),
        )
    return SeriesTabCounts(all=values["all"], running=values["running"], archive=values["archive"])


async def list_series(
    session: AsyncSession,
    query: SeriesListQuery,
) -> SeriesListResponse:
    base = await _filtered_series_base(session, query)

    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    events_count = (
        select(func.count(Event.id))
        .where(Event.series_id == Series.id)
        .correlate(Series)
        .scalar_subquery()
    )

    # Archive (finished): newest ended first; active feed: soonest start first.
    if query.status == SeriesStatus.FINISHED:
        order = (Series.ends_on.desc(), Series.name.asc())
    else:
        order = (Series.starts_on.asc(), Series.name.asc())

    rows = await session.execute(
        base.options(
            selectinload(Series.organizer),
            selectinload(Series.venue).selectinload(Venue.country),
        )
        .add_columns(events_count)
        .order_by(*order)
        .limit(query.limit)
        .offset(query.offset)
    )

    pairs = list(rows.all())
    series_only = [series for series, _ in pairs]
    min_buyins_map = await _load_min_buyins(session, [series.id for series in series_only])
    card_stats = await _load_running_card_stats(session, series_only)
    items = [
        _series_list_item(
            series,
            count,
            min_buyins_map.get(series.id, []),
            today_events_count=card_stats[series.id][0] if series.id in card_stats else None,
            highlight=card_stats[series.id][1] if series.id in card_stats else None,
        )
        for series, count in pairs
    ]
    resolved_total = total or 0
    return SeriesListResponse(
        items=items,
        total=resolved_total,
        limit=query.limit,
        offset=query.offset,
        counts=await _series_tab_counts(session, query, current_total=resolved_total),
    )


def _group_events_by_day(series: Series) -> list[EventsDayGroup]:
    venue_timezone = series.venue.timezone
    # Keep day-local sort keys separately because EventSummary now carries all flights.
    buckets: dict[date, list[tuple[datetime, EventSummary]]] = {}

    for event in series.events:
        if not event.flights:
            continue
        days_present = {
            venue_local_date(flight.start_at, venue_timezone) for flight in event.flights
        }
        summary = _event_summary(event, list(event.flights), venue_timezone)
        for day in days_present:
            day_start = min(
                flight.start_at
                for flight in event.flights
                if venue_local_date(flight.start_at, venue_timezone) == day
            )
            buckets.setdefault(day, []).append((day_start, summary))

    result: list[EventsDayGroup] = []
    for day in sorted(buckets):
        ordered = sorted(
            buckets[day],
            key=lambda item: (
                item[0],
                item[1].number if item[1].number is not None else 10_000,
                item[1].name,
            ),
        )
        result.append(EventsDayGroup(date=day, events=[summary for _, summary in ordered]))
    return result


async def get_series_detail(session: AsyncSession, series_key: UUID | str) -> SeriesDetail:
    from app.services import slugs as slugs_service

    series_id = (
        series_key
        if isinstance(series_key, UUID)
        else await slugs_service.resolve_series_id(session, series_key)
    )
    stmt = (
        select(Series)
        .where(Series.id == series_id)
        .options(
            selectinload(Series.organizer),
            selectinload(Series.venue).selectinload(Venue.country),
            selectinload(Series.events).selectinload(Event.currency),
            selectinload(Series.events).selectinload(Event.flights),
        )
    )
    series = await session.scalar(stmt)
    if series is None:
        raise NotFoundError("Series not found")

    list_item = _series_list_item(
        series,
        len(series.events),
        _min_buyins_from_events(list(series.events)),
        **_card_stats_kwargs(series),
    )
    return SeriesDetail(
        id=list_item.id,
        slug=list_item.slug,
        name=list_item.name,
        starts_on=list_item.starts_on,
        ends_on=list_item.ends_on,
        status=list_item.status,
        poster_url=list_item.poster_url,
        description=series.description,
        links=dict(series.links),
        organizer=list_item.organizer,
        venue=list_item.venue,
        country=list_item.country,
        events_count=list_item.events_count,
        days_until_start=list_item.days_until_start,
        min_buyins=list_item.min_buyins,
        today_events_count=list_item.today_events_count,
        highlight=list_item.highlight,
        events_by_day=_group_events_by_day(series),
    )


async def get_event_detail(session: AsyncSession, event_key: UUID | str) -> EventDetail:
    from app.services import slugs as slugs_service

    event_id = (
        event_key
        if isinstance(event_key, UUID)
        else await slugs_service.resolve_event_id(session, event_key)
    )
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.currency),
            selectinload(Event.flights),
            selectinload(Event.blind_levels),
            selectinload(Event.series).selectinload(Series.organizer),
            selectinload(Event.series).selectinload(Series.venue).selectinload(Venue.country),
            selectinload(Event.series).selectinload(Series.events).selectinload(Event.currency),
        )
    )
    event = await session.scalar(stmt)
    if event is None:
        raise NotFoundError("Event not found")

    venue_timezone = event.series.venue.timezone
    flights = sorted(event.flights, key=lambda item: item.start_at)
    blind_levels = sorted(
        event.blind_levels,
        key=lambda item: (item.structure_set_label or "default", item.level_no),
    )
    series_item = _series_list_item(
        event.series,
        len(event.series.events),
        _min_buyins_from_events(list(event.series.events)),
    )

    return EventDetail(
        id=event.id,
        slug=event.slug,
        number=event.number,
        name=event.name,
        buyin=event.buyin,
        buyin_bounty=event.buyin_bounty,
        currency=_currency_brief(event),
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
        series=series_item,
        venue=_venue_brief(event.series.venue),
        country=_country_brief(event.series.venue.country),
        flights=[_flight_read(flight, venue_timezone) for flight in flights],
        blind_levels=[BlindLevelRead.model_validate(level) for level in blind_levels],
    )


async def get_calendar(
    session: AsyncSession,
    query: CalendarQuery,
    *,
    user: User | None = None,
) -> CalendarResponse:
    year, month_num = parse_calendar_month(query.month)
    month_start = date(year, month_num, 1)
    month_end = date(year, month_num, monthrange(year, month_num)[1])

    period_start: date | None = None
    period_end: date | None = None
    if query.from_ is not None and query.to is not None:
        period_start, period_end = normalize_calendar_period(query.from_, query.to)
        range_start, range_end = period_start, period_end
    else:
        range_start, range_end = month_start, month_end

    stmt = _apply_series_filters(
        select(Series),
        country_code=query.country_code,
        zone=query.zone,
        organizer_id=query.organizer_id,
        status=query.status,
        starts_from=range_start,
        starts_to=range_end,
        game_type=query.game_type,
        tags=query.tags,
    ).options(
        selectinload(Series.venue).selectinload(Venue.country),
        selectinload(Series.organizer),
        selectinload(Series.events).selectinload(Event.currency),
        selectinload(Series.events).selectinload(Event.flights),
    )

    series_list = list(await session.scalars(stmt))
    if query.buyin_min is not None or query.buyin_max is not None:
        matched = await _series_ids_matching_buyin(
            session,
            series_ids=[series.id for series in series_list],
            buyin_presets=None,
            buyin_min=query.buyin_min,
            buyin_max=query.buyin_max,
            base_currency="RUB",
        )
        series_list = [series for series in series_list if series.id in matched]
    bookmarked_ids: set[UUID] = set()
    if user is not None:
        bookmarked_ids = await _bookmarked_series_ids_for_user(
            session,
            user.id,
            [series.id for series in series_list],
        )

    calendar_series: list[CalendarSeriesItem] = []
    for series in sorted(series_list, key=lambda item: (item.starts_on, item.name)):
        events = list(series.events)
        period_kwargs: dict[str, object] = {
            "coverage": None,
            "overlap_starts_on": None,
            "overlap_ends_on": None,
            "events_in_period": None,
            "min_buyins_in_period": None,
        }
        if period_start is not None and period_end is not None:
            period_kwargs = _period_fields_for_series(
                series,
                period_start=period_start,
                period_end=period_end,
            )
        calendar_series.append(
            CalendarSeriesItem(
                **_series_list_item(
                    series,
                    len(events),
                    _min_buyins_from_events(events),
                ).model_dump(),
                is_bookmarked=series.id in bookmarked_ids,
                **period_kwargs,
            )
        )

    days: list[CalendarDay] = []
    current = month_start
    while current <= month_end:
        markers: list[CalendarSeriesMarker] = []
        for series in series_list:
            if series.starts_on <= current <= series.ends_on:
                markers.append(
                    CalendarSeriesMarker(
                        id=series.id,
                        name=series.name,
                        status=series.status,
                        venue_city=series.venue.city,
                        is_start=current == series.starts_on,
                        is_end=current == series.ends_on,
                        is_bookmarked=series.id in bookmarked_ids,
                    )
                )
        markers.sort(key=lambda item: item.name)
        days.append(CalendarDay(date=current, series=markers))
        current += timedelta(days=1)

    return CalendarResponse(
        month=query.month,
        from_=period_start,
        to=period_end,
        days=days,
        series=calendar_series,
    )


async def get_schedule_filters(session: AsyncSession) -> ScheduleFiltersResponse:
    countries = list(await session.scalars(select(Country).order_by(Country.name_ru.asc())))
    organizers = list(await session.scalars(select(Organizer).order_by(Organizer.name.asc())))
    zones = list(
        await session.scalars(
            select(distinct(Venue.zone)).where(Venue.zone.is_not(None)).order_by(Venue.zone.asc())
        )
    )
    tag_rows = await session.scalars(select(Event.tags))
    tags = sorted({tag for row in tag_rows for tag in row})

    return ScheduleFiltersResponse(
        countries=[_country_brief(country) for country in countries],
        zones=[zone for zone in zones if zone is not None],
        organizers=[_organizer_brief(organizer) for organizer in organizers],
        statuses=list(SeriesStatus),
        game_types=list(GameType),
        tags=tags,
    )


async def _count_series_for_query(session: AsyncSession, query: SeriesListQuery) -> int:
    return await _count_matching_series(session, query)


async def get_schedule_filter_counts(
    session: AsyncSession,
    query: SeriesListQuery,
) -> ScheduleFilterCountsResponse:
    from app.services.buyin_presets import BUYIN_PRESET_IDS

    total = await _count_series_for_query(session, query)
    options = await get_schedule_filters(session)

    country_facets: list[FilterFacetCount] = []
    base_without_countries = query.model_copy(update={"country_code": None, "country_codes": None})
    for country in options.countries:
        count = await _count_series_for_query(
            session,
            base_without_countries.model_copy(update={"country_codes": [country.code]}),
        )
        country_facets.append(FilterFacetCount(value=country.code, count=count))

    organizer_facets: list[FilterFacetCount] = []
    base_without_orgs = query.model_copy(update={"organizer_id": None, "organizer_ids": None})
    for organizer in options.organizers:
        count = await _count_series_for_query(
            session,
            base_without_orgs.model_copy(update={"organizer_ids": [organizer.id]}),
        )
        organizer_facets.append(FilterFacetCount(value=str(organizer.id), count=count))

    buyin_facets: list[FilterFacetCount] = []
    base_without_buyin = query.model_copy(
        update={"buyin_presets": None, "buyin_min": None, "buyin_max": None}
    )
    for preset in BUYIN_PRESET_IDS:
        count = await _count_series_for_query(
            session,
            base_without_buyin.model_copy(update={"buyin_presets": [preset]}),
        )
        buyin_facets.append(FilterFacetCount(value=preset, count=count))

    return ScheduleFilterCountsResponse(
        total=total,
        countries=country_facets,
        organizers=organizer_facets,
        buyin=buyin_facets,
    )
