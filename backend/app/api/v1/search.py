from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.search import SearchResponse
from app.services import search as search_service

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
async def search(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[str, Query(min_length=1, max_length=128)],
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
    series_limit: Annotated[int | None, Query(ge=1, le=20)] = None,
    venues_limit: Annotated[int | None, Query(ge=1, le=20)] = None,
    events_limit: Annotated[int | None, Query(ge=1, le=20)] = None,
) -> SearchResponse:
    return await search_service.search(
        db,
        q=q,
        limit=limit,
        series_limit=series_limit,
        venues_limit=venues_limit,
        events_limit=events_limit,
    )
