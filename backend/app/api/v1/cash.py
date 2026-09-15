from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.cash import CashTableRead
from app.services import cash as cash_service

router = APIRouter(tags=["cash"])


@router.get("/cash-tables", response_model=list[CashTableRead])
async def get_cash_tables(db: Annotated[AsyncSession, Depends(get_db)]) -> list[CashTableRead]:
    """Кэш-столы, которые сборщик видел в последние 45 минут. Открыто без входа, как расписание."""
    return await cash_service.list_cash_tables(db, now=datetime.now(UTC))
