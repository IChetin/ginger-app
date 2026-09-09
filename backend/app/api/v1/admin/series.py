from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.models.enums import SeriesStatus
from app.schemas.admin_schedule import (
    ChangeLogAdminRead,
    EventAdminRead,
    EventCreate,
    SeriesAdminRead,
    SeriesCreate,
    SeriesUpdate,
)
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.notifications import NotificationPreviewResponse
from app.services import admin_schedule as schedule_admin_service
from app.services.admin_headers import parse_notify_header

router = APIRouter()


@router.get("/series", response_model=PaginatedResponse[SeriesAdminRead])
async def list_series(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query(max_length=128)] = None,
    status: Annotated[SeriesStatus | None, Query()] = None,
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    organizer_id: Annotated[UUID | None, Query()] = None,
    empty_events: Annotated[bool, Query()] = False,
    stale: Annotated[bool, Query()] = False,
) -> PaginatedResponse[SeriesAdminRead]:
    return await schedule_admin_service.list_series(
        db,
        PaginationParams(limit=limit, offset=offset),
        search=search,
        status=status,
        country_code=country_code,
        organizer_id=organizer_id,
        empty_events=empty_events,
        stale=stale,
    )


@router.post("/series", response_model=SeriesAdminRead, status_code=status.HTTP_201_CREATED)
async def create_series(
    body: SeriesCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SeriesAdminRead:
    return await schedule_admin_service.create_series(db, body, actor_id=user.id)


@router.get("/series/{series_id}", response_model=SeriesAdminRead)
async def get_series(
    series_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SeriesAdminRead:
    return await schedule_admin_service.get_series(db, series_id)


@router.get("/series/{series_id}/changes", response_model=list[ChangeLogAdminRead])
async def list_series_changes(
    series_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ChangeLogAdminRead]:
    return await schedule_admin_service.list_series_changes(db, series_id, limit=limit)


@router.post("/series/{series_id}/preview", response_model=NotificationPreviewResponse)
async def preview_series_update(
    series_id: UUID,
    body: SeriesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreviewResponse:
    return await schedule_admin_service.preview_series_update(
        db,
        series_id,
        body,
        actor_id=user.id,
    )


@router.patch("/series/{series_id}", response_model=SeriesAdminRead)
async def update_series(
    series_id: UUID,
    body: SeriesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    preview_token: Annotated[str | None, Header(alias="X-Preview-Token")] = None,
    x_notify: Annotated[str | None, Header(alias="X-Notify")] = None,
) -> SeriesAdminRead:
    return await schedule_admin_service.update_series(
        db,
        series_id,
        body,
        actor_id=user.id,
        preview_token=preview_token,
        notify=parse_notify_header(x_notify),
    )


@router.delete("/series/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series(
    series_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await schedule_admin_service.delete_series(db, series_id, actor_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/series/{series_id}/events", response_model=list[EventAdminRead])
async def list_series_events(
    series_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EventAdminRead]:
    return await schedule_admin_service.list_series_events(db, series_id)


@router.post(
    "/series/{series_id}/events",
    response_model=EventAdminRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_series_event(
    series_id: UUID,
    body: EventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> EventAdminRead:
    return await schedule_admin_service.create_event(db, series_id, body, actor_id=user.id)
