from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_collector
from app.schemas.cash import CashSnapshotIn, CashSnapshotResult
from app.schemas.collector import RunFinish, RunRead, RunStart, SnapshotIn, SnapshotResult
from app.services import cash as cash_service
from app.services import collector as collector_service

# Приём данных от сборщика лобби: телефон со скриптом, постоянный токен, без сессии человека.
router = APIRouter(
    prefix="/collector",
    tags=["collector"],
    dependencies=[Depends(require_collector)],
)

Db = Annotated[AsyncSession, Depends(get_db)]


@router.post("/runs", response_model=RunRead, status_code=status.HTTP_201_CREATED)
async def create_run(body: RunStart, db: Db) -> RunRead:
    """Начало прохода: сборщик сообщает, какое приложение и что обходит."""
    return await collector_service.start_run(db, body)


@router.post("/runs/{run_id}/snapshots", response_model=SnapshotResult)
async def add_snapshot(run_id: UUID, body: SnapshotIn, db: Db) -> SnapshotResult:
    """Лобби одного клуба: турниры сверяются с сеткой сразу."""
    return await collector_service.ingest_snapshot(db, run_id, body)


@router.post("/runs/{run_id}/cash", response_model=CashSnapshotResult)
async def add_cash_snapshot(run_id: UUID, body: CashSnapshotIn, db: Db) -> CashSnapshotResult:
    """Список кэш-столов одного клуба: столы обновляются, пропавшие закрываются."""
    return await cash_service.ingest_cash_snapshot(db, run_id, body)


@router.post("/runs/{run_id}/finish", response_model=RunRead)
async def finish_run(run_id: UUID, body: RunFinish, db: Db) -> RunRead:
    return await collector_service.finish_run(db, run_id, body)
