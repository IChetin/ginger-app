from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.picks import EditorPickAdminRead, EditorPickCreate, EditorPickUpdate
from app.services import picks as picks_service

router = APIRouter(prefix="/editor-picks")

Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[EditorPickAdminRead])
async def list_picks(db: Db) -> list[EditorPickAdminRead]:
    return await picks_service.list_admin_picks(db, now=datetime.now(UTC))


@router.post("", response_model=list[EditorPickAdminRead], status_code=status.HTTP_201_CREATED)
async def create_pick(body: EditorPickCreate, db: Db) -> list[EditorPickAdminRead]:
    """Добавить в отбор; в ответ — список со счётчиком: сразу видно, ловит ли условие."""
    await picks_service.create_pick(db, body)
    return await picks_service.list_admin_picks(db, now=datetime.now(UTC))


@router.patch("/{pick_id}", response_model=list[EditorPickAdminRead])
async def update_pick(pick_id: UUID, body: EditorPickUpdate, db: Db) -> list[EditorPickAdminRead]:
    await picks_service.update_pick(db, pick_id, body)
    return await picks_service.list_admin_picks(db, now=datetime.now(UTC))


@router.delete("/{pick_id}", response_model=list[EditorPickAdminRead])
async def delete_pick(pick_id: UUID, db: Db) -> list[EditorPickAdminRead]:
    await picks_service.delete_pick(db, pick_id)
    return await picks_service.list_admin_picks(db, now=datetime.now(UTC))
