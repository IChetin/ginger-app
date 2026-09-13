"""Фишки глазами игрока: профиль игрока, аккаунты в клубах, заявки (ТЗ §3, экран «Фишки»)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.chips import (
    ChipRequestCreate,
    ChipRequestRead,
    InviteCheck,
    PlayerAccountCreate,
    PlayerAccountRead,
    PlayerMe,
    PlayerMeUpdate,
)
from app.services import chips as chips_service
from app.services import invites as invites_service

router = APIRouter(tags=["chips"])

CurrentUser = Annotated[User, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me/player", response_model=PlayerMe)
async def get_player_me(user: CurrentUser, db: Db) -> PlayerMe:
    return await chips_service.player_me(db, user)


@router.patch("/me/player", response_model=PlayerMe)
async def update_player_me(body: PlayerMeUpdate, user: CurrentUser, db: Db) -> PlayerMe:
    return await chips_service.update_player_me(db, user, body)


@router.post("/me/accounts", response_model=PlayerAccountRead, status_code=status.HTTP_201_CREATED)
async def add_account(body: PlayerAccountCreate, user: CurrentUser, db: Db) -> PlayerAccountRead:
    return await chips_service.add_account(db, user, body)


@router.get("/me/chip-requests", response_model=list[ChipRequestRead])
async def list_requests(user: CurrentUser, db: Db) -> list[ChipRequestRead]:
    return await chips_service.list_player_requests(db, user)


@router.post(
    "/me/chip-requests", response_model=ChipRequestRead, status_code=status.HTTP_201_CREATED
)
async def create_request(body: ChipRequestCreate, user: CurrentUser, db: Db) -> ChipRequestRead:
    return await chips_service.create_request(db, user, body)


@router.get("/me/chip-requests/{request_id}", response_model=ChipRequestRead)
async def get_request(request_id: UUID, user: CurrentUser, db: Db) -> ChipRequestRead:
    return await chips_service.get_player_request(db, user, request_id)


@router.post("/me/chip-requests/{request_id}/screenshot", response_model=ChipRequestRead)
async def upload_screenshot(
    request_id: UUID,
    user: CurrentUser,
    db: Db,
    file: Annotated[UploadFile, File()],
) -> ChipRequestRead:
    return await chips_service.attach_screenshot(
        db, user, request_id, data=await file.read(), content_type=file.content_type
    )


@router.get("/me/chip-requests/{request_id}/screenshot")
async def get_screenshot(request_id: UUID, user: CurrentUser, db: Db) -> Response:
    data, content_type = await chips_service.player_screenshot(db, user, request_id)
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "no-store"})


@router.get("/invites/{token}", response_model=InviteCheck)
async def check_invite(token: str, db: Db) -> InviteCheck:
    """Без входа: страница приглашения проверяет ссылку до регистрации."""
    return await invites_service.check_invite(db, token)
