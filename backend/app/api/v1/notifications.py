from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.notifications import (
    NotificationHistoryItem,
    NotificationListResponse,
    NotificationReadRequest,
    NotificationReadResponse,
    NotificationUnreadCountResponse,
)
from app.services import notifications as notifications_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    type: Annotated[Literal["reminders", "changes"] | None, Query()] = None,
    unread_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NotificationListResponse:
    return await notifications_service.list_notifications(
        db,
        user,
        type_filter=type,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )


@router.post("/read", response_model=NotificationReadResponse)
async def mark_notifications_read(
    body: NotificationReadRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationReadResponse:
    marked = await notifications_service.mark_notifications_read(
        db,
        user,
        ids=body.ids,
        mark_all=body.all,
    )
    return NotificationReadResponse(marked=marked)


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def unread_count(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationUnreadCountResponse:
    count = await notifications_service.unread_notifications_count(db, user)
    return NotificationUnreadCountResponse(count=count)


@router.get("/history", response_model=list[NotificationHistoryItem])
async def notification_history(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: Annotated[int, Query(ge=1, le=90)] = 30,
) -> list[NotificationHistoryItem]:
    return await notifications_service.list_notification_history(db, user, days=days)
