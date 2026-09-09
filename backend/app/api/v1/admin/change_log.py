from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.enums import ChangeType
from app.schemas.admin_schedule import ChangeLogListItem
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services import admin_change_log as change_log_admin_service
from app.services.admin_change_log import PeriodFilter

router = APIRouter(tags=["admin-change-log"])


@router.get("/change-log", response_model=PaginatedResponse[ChangeLogListItem])
async def list_change_log(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    entity_type: Annotated[str | None, Query()] = None,
    change_type: Annotated[ChangeType | None, Query()] = None,
    actor_id: Annotated[UUID | None, Query()] = None,
    search: Annotated[str | None, Query(alias="q")] = None,
    period: Annotated[PeriodFilter, Query()] = "7",
) -> PaginatedResponse[ChangeLogListItem]:
    return await change_log_admin_service.list_change_log(
        db,
        PaginationParams(limit=limit, offset=offset),
        entity_type=entity_type,
        change_type=change_type,
        actor_id=actor_id,
        search=search,
        period=period,
    )
