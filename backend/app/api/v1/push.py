from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.push import (
    PushSubscribeBody,
    PushSubscriptionRead,
    PushUnsubscribeBody,
    VapidPublicKeyResponse,
)
from app.services import push as push_service

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def vapid_public_key() -> VapidPublicKeyResponse:
    return VapidPublicKeyResponse(public_key=push_service.get_vapid_public_key())


@router.post(
    "/subscribe",
    response_model=PushSubscriptionRead,
    status_code=status.HTTP_201_CREATED,
)
async def subscribe(
    body: PushSubscribeBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PushSubscriptionRead:
    row = await push_service.upsert_subscription(db, user, body)
    return PushSubscriptionRead.model_validate(row)


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribeBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await push_service.delete_subscription(db, user, str(body.endpoint))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
