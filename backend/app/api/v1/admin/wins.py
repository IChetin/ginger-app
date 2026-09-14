"""Выигрыши игроков для ленты: менеджер заносит и удаляет (этап 7)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.feed import WinCreate, WinRead
from app.services import feed as feed_service

router = APIRouter()

Db = Annotated[AsyncSession, Depends(get_db)]
Manager = Annotated[User, Depends(get_current_user)]


@router.get("/wins", response_model=list[WinRead])
async def list_wins(db: Db) -> list[WinRead]:
    return await feed_service.list_wins(db, public=False, limit=200)


@router.post("/wins", response_model=WinRead, status_code=201)
async def create_win(body: WinCreate, actor: Manager, db: Db) -> WinRead:
    return await feed_service.create_win(db, actor, body)


@router.delete("/wins/{win_id}", status_code=204)
async def delete_win(win_id: UUID, db: Db) -> Response:
    await feed_service.delete_win(db, win_id)
    return Response(status_code=204)
