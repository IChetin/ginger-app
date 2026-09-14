"""Mini-CRM в админке (этап 9): карточка игрока, сводка, рассылки, выгрузка базы."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.auth import User
from app.schemas.crm import (
    BroadcastCreate,
    BroadcastPreview,
    BroadcastRead,
    BroadcastSegment,
    CrmSummary,
    PlayerCrmCard,
)
from app.services import crm as crm_service
from app.services.tournaments.schedule_sync import MSK

router = APIRouter()

Db = Annotated[AsyncSession, Depends(get_db)]
Admin = Annotated[User, Depends(require_admin)]


@router.get("/crm/summary", response_model=CrmSummary)
async def get_summary(db: Db) -> CrmSummary:
    return await crm_service.summary(db)


# Выгрузка объявлена раньше карточки: иначе «export.csv» попал бы в {player_id}.
@router.get("/players/export.csv")
async def export_players(_: Admin, db: Db) -> Response:
    """Экспорт базы — только админ (ТЗ §9а.1)."""
    data = await crm_service.export_players_csv(db)
    filename = f"ginger-players-{datetime.now(MSK):%Y-%m-%d}.csv"
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/players/{player_id}", response_model=PlayerCrmCard)
async def get_player_card(player_id: UUID, db: Db) -> PlayerCrmCard:
    return await crm_service.get_player_card(db, player_id)


@router.post("/broadcasts/preview", response_model=BroadcastPreview)
async def preview_broadcast(segment: BroadcastSegment, _: Admin, db: Db) -> BroadcastPreview:
    return await crm_service.preview_broadcast(db, segment)


@router.post("/broadcasts", response_model=BroadcastRead, status_code=201)
async def send_broadcast(body: BroadcastCreate, actor: Admin, db: Db) -> BroadcastRead:
    """Рассылки — только админ (ТЗ §9а.1); каждая пишется в журнал с автором и сегментом."""
    return await crm_service.send_broadcast(db, actor, body)


@router.get("/broadcasts", response_model=list[BroadcastRead])
async def list_broadcasts(_: Admin, db: Db) -> list[BroadcastRead]:
    return await crm_service.list_broadcasts(db)
