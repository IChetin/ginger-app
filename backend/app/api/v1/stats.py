from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.stats import (
    StatsChartResponse,
    StatsFilterCountsResponse,
    StatsFilterParams,
    StatsFiltersResponse,
    StatsSummary,
)
from app.services import stats as stats_service
from app.services.buyin_presets import parse_buyin_presets
from app.services.pdf import stats_share_card as share_card_service
from app.services.stats import UNLINKED_SERIES_VALUE

router = APIRouter(prefix="/stats", tags=["stats"])


def _split_csv(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    return parts or None


def _parse_series_param(raw: str | None) -> tuple[list[UUID] | None, bool]:
    parts = _split_csv(raw)
    if not parts:
        return None, False
    include_unlinked = False
    ids: list[UUID] = []
    for part in parts:
        if part == UNLINKED_SERIES_VALUE:
            include_unlinked = True
            continue
        ids.append(UUID(part))
    return (ids or None), include_unlinked


def _parse_uuid_csv(raw: str | None) -> list[UUID] | None:
    parts = _split_csv(raw)
    if not parts:
        return None
    return [UUID(part) for part in parts]


def _filters(
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    series_id: Annotated[UUID | None, Query()] = None,
    series: Annotated[str | None, Query(description="Comma-separated series UUIDs or 'none'")] = None,
    venue_id: Annotated[UUID | None, Query()] = None,
    venues: Annotated[str | None, Query(description="Comma-separated venue UUIDs")] = None,
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    buyin_min: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin_max: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin: Annotated[str | None, Query(description="Comma-separated presets")] = None,
    result: Annotated[str | None, Query(description="itm,no_itm")] = None,
) -> StatsFilterParams:
    series_ids, include_unlinked = _parse_series_param(series)
    return StatsFilterParams(
        date_from=date_from,
        date_to=date_to,
        series_id=series_id,
        series_ids=series_ids,
        include_unlinked=include_unlinked,
        venue_id=venue_id,
        venue_ids=_parse_uuid_csv(venues),
        country_code=country_code,
        buyin_min=buyin_min,
        buyin_max=buyin_max,
        buyin_presets=parse_buyin_presets(buyin) or None,
        result_kinds=_split_csv(result),
    )


@router.get("", response_model=StatsSummary)
async def get_stats(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    filters: Annotated[StatsFilterParams, Depends(_filters)],
) -> StatsSummary:
    return await stats_service.compute_stats(db, user, filters)


@router.get("/chart", response_model=StatsChartResponse)
async def get_stats_chart(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    filters: Annotated[StatsFilterParams, Depends(_filters)],
) -> StatsChartResponse:
    return await stats_service.compute_chart(db, user, filters)


@router.get("/filters", response_model=StatsFiltersResponse)
async def get_stats_filters(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StatsFiltersResponse:
    return await stats_service.list_stats_filters(db, user)


@router.get("/filter-counts", response_model=StatsFilterCountsResponse)
async def get_stats_filter_counts(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    filters: Annotated[StatsFilterParams, Depends(_filters)],
) -> StatsFilterCountsResponse:
    return await stats_service.get_stats_filter_counts(db, user, filters)


@router.get("/share-card.png")
async def get_stats_share_card(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    filters: Annotated[StatsFilterParams, Depends(_filters)],
) -> Response:
    client_ip = request.client.host if request.client else "unknown"
    png_bytes, filename, cache_hit = await share_card_service.get_stats_share_card_png(
        db,
        user,
        filters,
        client_ip=client_ip,
    )
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Share-Cache": "HIT" if cache_hit else "MISS",
        "Cache-Control": "private, max-age=60",
    }
    return Response(content=png_bytes, media_type="image/png", headers=headers)
