from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.admin_schedule import (
    BlindLevelAdminRead,
    BlindLevelUpsert,
    ChangeLogListItem,
    EventAdminRead,
    EventUpdate,
    FlightAdminRead,
    FlightUpsert,
)
from app.schemas.notifications import NotificationPreviewResponse
from app.services import admin_schedule as schedule_admin_service
from app.services.admin_headers import parse_notify_header

router = APIRouter()


@router.get("/events/{event_id}", response_model=EventAdminRead)
async def get_event(
    event_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventAdminRead:
    return await schedule_admin_service.get_event(db, event_id)


@router.get("/events/{event_id}/changes", response_model=list[ChangeLogListItem])
async def list_event_changes(
    event_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ChangeLogListItem]:
    return await schedule_admin_service.list_event_changes(db, event_id, limit=limit)


@router.post("/events/{event_id}/duplicate", response_model=EventAdminRead)
async def duplicate_event(
    event_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> EventAdminRead:
    return await schedule_admin_service.duplicate_event(db, event_id, actor_id=user.id)


@router.post("/events/{event_id}/preview", response_model=NotificationPreviewResponse)
async def preview_event_update(
    event_id: UUID,
    body: EventUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreviewResponse:
    return await schedule_admin_service.preview_event_update(
        db,
        event_id,
        body,
        actor_id=user.id,
    )


@router.patch("/events/{event_id}", response_model=EventAdminRead)
async def update_event(
    event_id: UUID,
    body: EventUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    preview_token: Annotated[str | None, Header(alias="X-Preview-Token")] = None,
    x_notify: Annotated[str | None, Header(alias="X-Notify")] = None,
) -> EventAdminRead:
    return await schedule_admin_service.update_event(
        db,
        event_id,
        body,
        actor_id=user.id,
        preview_token=preview_token,
        notify=parse_notify_header(x_notify),
    )


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await schedule_admin_service.delete_event(db, event_id, actor_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/events/{event_id}/flights", response_model=list[FlightAdminRead])
async def list_flights(
    event_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FlightAdminRead]:
    return await schedule_admin_service.list_flights(db, event_id)


@router.post(
    "/events/{event_id}/flights/preview",
    response_model=NotificationPreviewResponse,
)
async def preview_flights_replace(
    event_id: UUID,
    body: list[FlightUpsert],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreviewResponse:
    return await schedule_admin_service.preview_flights_replace(
        db,
        event_id,
        body,
        actor_id=user.id,
    )


@router.put("/events/{event_id}/flights", response_model=list[FlightAdminRead])
async def replace_flights(
    event_id: UUID,
    body: list[FlightUpsert],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    preview_token: Annotated[str | None, Header(alias="X-Preview-Token")] = None,
    x_notify: Annotated[str | None, Header(alias="X-Notify")] = None,
) -> list[FlightAdminRead]:
    return await schedule_admin_service.replace_flights(
        db,
        event_id,
        body,
        actor_id=user.id,
        preview_token=preview_token,
        notify=parse_notify_header(x_notify),
    )


@router.get("/events/{event_id}/blind-levels", response_model=list[BlindLevelAdminRead])
async def list_blind_levels(
    event_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BlindLevelAdminRead]:
    return await schedule_admin_service.list_blind_levels(db, event_id)


@router.put("/events/{event_id}/blind-levels", response_model=list[BlindLevelAdminRead])
async def replace_blind_levels(
    event_id: UUID,
    body: list[BlindLevelUpsert],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[BlindLevelAdminRead]:
    return await schedule_admin_service.replace_blind_levels(db, event_id, body, actor_id=user.id)
