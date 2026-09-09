from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.results import (
    ResultCreate,
    ResultEventSearchItem,
    ResultListItem,
    ResultRead,
    ResultUpdate,
)
from app.schemas.schedule import CurrencyBrief
from app.schemas.stats import StatsFilterParams
from app.services import results as results_service
from app.services.buyin_presets import parse_buyin_presets
from app.services.stats import UNLINKED_SERIES_VALUE

router = APIRouter(prefix="/results", tags=["results"])


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


@router.get("", response_model=PaginatedResponse[ResultListItem])
async def list_results(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    series_id: Annotated[UUID | None, Query()] = None,
    series: Annotated[str | None, Query()] = None,
    venue_id: Annotated[UUID | None, Query()] = None,
    venues: Annotated[str | None, Query()] = None,
    buyin_min: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin_max: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin: Annotated[str | None, Query()] = None,
    result: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedResponse[ResultListItem]:
    series_ids, include_unlinked = _parse_series_param(series)
    return await results_service.list_results(
        db,
        user,
        PaginationParams(limit=limit, offset=offset),
        StatsFilterParams(
            date_from=date_from,
            date_to=date_to,
            series_id=series_id,
            series_ids=series_ids,
            include_unlinked=include_unlinked,
            venue_id=venue_id,
            venue_ids=_parse_uuid_csv(venues),
            buyin_min=buyin_min,
            buyin_max=buyin_max,
            buyin_presets=parse_buyin_presets(buyin) or None,
            result_kinds=_split_csv(result),
        ),
    )


@router.post("", response_model=ResultRead, status_code=status.HTTP_201_CREATED)
async def create_result(
    body: ResultCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRead:
    result = await results_service.create_result(db, user, body)
    return ResultRead.model_validate(result)


@router.get("/search-events", response_model=list[ResultEventSearchItem])
async def search_result_events(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[str, Query(max_length=160)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[ResultEventSearchItem]:
    del user  # Auth dependency intentionally protects private tracker flow.
    return await results_service.search_past_events(db, query=q, limit=limit)


@router.get("/currencies", response_model=list[CurrencyBrief])
async def list_result_currencies(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CurrencyBrief]:
    del user
    return await results_service.list_result_currencies(db)


@router.get("/{result_id}", response_model=ResultRead)
async def get_result(
    result_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRead:
    result = await results_service.get_user_result(db, user, result_id)
    return ResultRead.model_validate(result)


@router.patch("/{result_id}", response_model=ResultRead)
async def update_result(
    result_id: UUID,
    body: ResultUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRead:
    result = await results_service.update_result(db, user, result_id, body)
    return ResultRead.model_validate(result)


@router.delete("/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result(
    result_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await results_service.delete_result(db, user, result_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
