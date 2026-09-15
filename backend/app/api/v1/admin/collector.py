from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.auth import User
from app.schemas.collector import CollectorStatus, TournamentChangeRead
from app.services import collector as collector_service

router = APIRouter(prefix="/collector")

Db = Annotated[AsyncSession, Depends(get_db)]
Admin = Annotated[User, Depends(require_admin)]


@router.get("/status", response_model=CollectorStatus)
async def get_status(db: Db) -> CollectorStatus:
    """Жив ли сборщик и сколько расхождений ждёт решения."""
    return await collector_service.collector_status(db)


@router.get("/changes", response_model=list[TournamentChangeRead])
async def get_changes(db: Db) -> list[TournamentChangeRead]:
    return await collector_service.list_changes(db)


@router.post("/changes/{change_id}/apply", response_model=TournamentChangeRead)
async def apply_change(change_id: UUID, user: Admin, db: Db) -> TournamentChangeRead:
    """Новый — добавить разовым стартом, пропавший — отменить, изменённый — поправить сетку."""
    return await collector_service.apply_change(db, change_id, user)


@router.post("/changes/{change_id}/dismiss", response_model=TournamentChangeRead)
async def dismiss_change(change_id: UUID, user: Admin, db: Db) -> TournamentChangeRead:
    return await collector_service.dismiss_change(db, change_id, user)
