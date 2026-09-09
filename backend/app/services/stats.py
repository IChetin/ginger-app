from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models.auth import User
from app.models.references import Venue
from app.models.schedule import Event, Series
from app.models.tracker import Result
from app.schemas.stats import (
    StatsChartPoint,
    StatsChartResponse,
    StatsCountryOption,
    StatsFacetCount,
    StatsFilterCountsResponse,
    StatsFilterOption,
    StatsFilterParams,
    StatsFiltersResponse,
    StatsSummary,
)
from app.services.buyin_presets import (
    BUYIN_PRESET_IDS,
    amount_matches_presets,
    parse_buyin_presets,
)
from app.services.fx import convert_amount, ensure_rates_for_results

UNLINKED_SERIES_VALUE = "none"
RESULT_ITM = "itm"
RESULT_NO_ITM = "no_itm"


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _load_user_results(
    session: AsyncSession,
    user: User,
) -> list[Result]:
    rows = await session.scalars(
        select(Result)
        .where(Result.user_id == user.id)
        .options(
            selectinload(Result.event)
            .selectinload(Event.series)
            .selectinload(Series.venue)
            .selectinload(Venue.country)
        )
        .order_by(Result.played_on.asc(), Result.created_at.asc(), Result.id.asc())
    )
    return list(rows)


def _resolved_series_ids(filters: StatsFilterParams) -> set[UUID]:
    ids: list[UUID] = []
    if filters.series_ids:
        ids.extend(filters.series_ids)
    if filters.series_id is not None:
        ids.append(filters.series_id)
    return set(ids)


def _resolved_venue_ids(filters: StatsFilterParams) -> set[UUID] | None:
    ids: list[UUID] = []
    if filters.venue_ids:
        ids.extend(filters.venue_ids)
    if filters.venue_id is not None:
        ids.append(filters.venue_id)
    return set(ids) if ids else None


def _has_series_filter(filters: StatsFilterParams) -> bool:
    return bool(_resolved_series_ids(filters)) or filters.include_unlinked


def _matches_relational(
    result: Result,
    filters: StatsFilterParams,
) -> bool:
    venue_ids = _resolved_venue_ids(filters)
    has_venue_filter = venue_ids is not None
    has_country_filter = filters.country_code is not None
    is_unlinked = result.event is None or result.event.series is None

    if _has_series_filter(filters):
        series_ids = _resolved_series_ids(filters)
        if is_unlinked:
            if not filters.include_unlinked:
                return False
        elif not series_ids or result.event.series.id not in series_ids:  # type: ignore[union-attr]
            return False

    if is_unlinked:
        return not has_venue_filter and not has_country_filter

    assert result.event is not None and result.event.series is not None
    series = result.event.series
    if venue_ids is not None and series.venue_id not in venue_ids:
        return False
    return not (
        filters.country_code is not None and series.venue.country_code != filters.country_code
    )


def _converted_buyin(
    result: Result,
    *,
    base_currency: str,
    rate_map: dict[tuple[str, date], Decimal],
) -> Decimal:
    return convert_amount(
        result.buyin,
        source_currency=result.currency_code,
        base_currency=base_currency,
        played_on=result.played_on,
        rate_map=rate_map,
    )


def _validate_filters(filters: StatsFilterParams) -> None:
    if filters.date_from and filters.date_to and filters.date_from > filters.date_to:
        raise AppError("validation_error", "date_from must be <= date_to", 400)
    if (
        filters.buyin_min is not None
        and filters.buyin_max is not None
        and filters.buyin_min > filters.buyin_max
    ):
        raise AppError("validation_error", "buyin_min must be <= buyin_max", 400)
    if filters.result_kinds:
        unknown = set(filters.result_kinds) - {RESULT_ITM, RESULT_NO_ITM}
        if unknown:
            raise AppError(
                "validation_error",
                f"Invalid result kinds: {', '.join(sorted(unknown))}",
                400,
            )


def _prefilter_results(
    results: list[Result],
    filters: StatsFilterParams,
) -> list[Result]:
    selected: list[Result] = []
    for result in results:
        if filters.date_from is not None and result.played_on < filters.date_from:
            continue
        if filters.date_to is not None and result.played_on > filters.date_to:
            continue
        if not _matches_relational(result, filters):
            continue
        selected.append(result)
    return selected


def _filter_converted_results(
    results: list[Result],
    *,
    user: User,
    filters: StatsFilterParams,
    rate_map: dict[tuple[str, date], Decimal],
) -> list[tuple[Result, Decimal, Decimal]]:
    base = user.base_currency
    presets = parse_buyin_presets(filters.buyin_presets)
    kinds = set(filters.result_kinds or [])
    selected: list[tuple[Result, Decimal, Decimal]] = []
    for result in results:
        buyin_base = _converted_buyin(result, base_currency=base, rate_map=rate_map)
        if presets:
            if not amount_matches_presets(buyin_base, presets):
                continue
        else:
            if filters.buyin_min is not None and buyin_base < filters.buyin_min:
                continue
            if filters.buyin_max is not None and buyin_base > filters.buyin_max:
                continue
        invested = _quantize(buyin_base * Decimal(result.entries_count))
        won = convert_amount(
            result.payout,
            source_currency=result.currency_code,
            base_currency=base,
            played_on=result.played_on,
            rate_map=rate_map,
        )
        if kinds:
            is_itm = won > 0
            if RESULT_ITM in kinds and is_itm:
                pass
            elif RESULT_NO_ITM in kinds and not is_itm:
                pass
            else:
                continue
        selected.append((result, invested, won))
    return selected


async def select_converted_results(
    session: AsyncSession,
    user: User,
    filters: StatsFilterParams,
) -> list[tuple[Result, Decimal, Decimal]]:
    _validate_filters(filters)
    results = _prefilter_results(await _load_user_results(session, user), filters)
    rate_map = await ensure_rates_for_results(session, results, user.base_currency)
    return _filter_converted_results(results, user=user, filters=filters, rate_map=rate_map)


async def compute_stats(
    session: AsyncSession,
    user: User,
    filters: StatsFilterParams,
) -> StatsSummary:
    selected = await select_converted_results(session, user, filters)
    tournaments = len(selected)
    entries = sum(result.entries_count for result, _, _ in selected)
    invested = _quantize(sum((item[1] for item in selected), Decimal("0")))
    won = _quantize(sum((item[2] for item in selected), Decimal("0")))
    profit = _quantize(won - invested)
    itm_count = sum(1 for _, _, payout in selected if payout > 0)
    roi = _quantize(profit / invested * Decimal("100")) if invested > 0 else None
    # ABI = total invested / entries (re-entries included), not / tournaments.
    abi = _quantize(invested / Decimal(entries)) if entries > 0 else None
    itm = (
        _quantize(Decimal(itm_count) / Decimal(tournaments) * Decimal("100"))
        if tournaments > 0
        else Decimal("0.00")
    )
    return StatsSummary(
        base_currency=user.base_currency,
        tournaments=tournaments,
        entries=entries,
        invested=invested,
        won=won,
        profit=profit,
        roi=roi,
        abi=abi,
        itm=itm,
    )


async def compute_chart(
    session: AsyncSession,
    user: User,
    filters: StatsFilterParams,
) -> StatsChartResponse:
    selected = await select_converted_results(session, user, filters)
    points: list[StatsChartPoint] = []
    cumulative = Decimal("0.00")
    for index, (result, invested, won) in enumerate(selected, start=1):
        profit = _quantize(won - invested)
        cumulative = _quantize(cumulative + profit)
        points.append(
            StatsChartPoint(
                index=index,
                result_id=result.id,
                played_on=result.played_on,
                label=result.name,
                profit=profit,
                cumulative_profit=cumulative,
            )
        )
    return StatsChartResponse(base_currency=user.base_currency, points=points)


async def list_stats_filters(
    session: AsyncSession,
    user: User,
) -> StatsFiltersResponse:
    results = await _load_user_results(session, user)
    series_map: dict[UUID, str] = {}
    venue_map: dict[UUID, str] = {}
    country_map: dict[str, str] = {}
    unlinked_count = 0
    for result in results:
        if result.event is None or result.event.series is None:
            unlinked_count += 1
            continue
        series = result.event.series
        series_map[series.id] = series.name
        venue_map[series.venue.id] = series.venue.name
        country = series.venue.country
        country_map[country.code] = country.name_ru

    return StatsFiltersResponse(
        series=[
            StatsFilterOption(id=item_id, name=name)
            for item_id, name in sorted(series_map.items(), key=lambda item: item[1])
        ],
        venues=[
            StatsFilterOption(id=item_id, name=name)
            for item_id, name in sorted(venue_map.items(), key=lambda item: item[1])
        ],
        countries=[
            StatsCountryOption(code=code, name_ru=name)
            for code, name in sorted(country_map.items(), key=lambda item: item[1])
        ],
        unlinked_count=unlinked_count,
    )


async def get_stats_filter_counts(
    session: AsyncSession,
    user: User,
    filters: StatsFilterParams,
) -> StatsFilterCountsResponse:
    selected = await select_converted_results(session, user, filters)
    total = len(selected)
    options = await list_stats_filters(session, user)

    async def count_with(update: dict[str, object]) -> int:
        patched = filters.model_copy(update=update)
        return len(await select_converted_results(session, user, patched))

    series_facets: list[StatsFacetCount] = []
    base_series = {
        "series_id": None,
        "series_ids": None,
        "include_unlinked": False,
    }
    for option in options.series:
        series_facets.append(
            StatsFacetCount(
                value=str(option.id),
                count=await count_with({**base_series, "series_ids": [option.id]}),
            )
        )
    if options.unlinked_count > 0:
        series_facets.append(
            StatsFacetCount(
                value=UNLINKED_SERIES_VALUE,
                count=await count_with({**base_series, "include_unlinked": True}),
            )
        )

    venue_facets: list[StatsFacetCount] = []
    for option in options.venues:
        venue_facets.append(
            StatsFacetCount(
                value=str(option.id),
                count=await count_with({"venue_id": None, "venue_ids": [option.id]}),
            )
        )

    buyin_facets: list[StatsFacetCount] = []
    for preset in BUYIN_PRESET_IDS:
        buyin_facets.append(
            StatsFacetCount(
                value=preset,
                count=await count_with(
                    {
                        "buyin_presets": [preset],
                        "buyin_min": None,
                        "buyin_max": None,
                    }
                ),
            )
        )

    result_facets = [
        StatsFacetCount(
            value=RESULT_ITM,
            count=await count_with({"result_kinds": [RESULT_ITM]}),
        ),
        StatsFacetCount(
            value=RESULT_NO_ITM,
            count=await count_with({"result_kinds": [RESULT_NO_ITM]}),
        ),
    ]

    return StatsFilterCountsResponse(
        total=total,
        series=series_facets,
        venues=venue_facets,
        buyin=buyin_facets,
        result=result_facets,
    )
