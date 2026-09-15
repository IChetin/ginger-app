from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.cash import CashGameRead
from app.services import cash as cash_service

router = APIRouter(tags=["cash"])


@router.get("/cash-games", response_model=list[CashGameRead])
async def get_cash_games(db: Annotated[AsyncSession, Depends(get_db)]) -> list[CashGameRead]:
    """Кэш-лимиты, которые сборщик видел в последние 45 минут. Открыто без входа, как MTT."""
    return await cash_service.list_cash_games(db, now=datetime.now(UTC))
