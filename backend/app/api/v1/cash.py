from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import ScheduleViewer
from app.schemas.cash import CashGameRead
from app.services import cash as cash_service
from app.services.tournaments.guest import cash_for_guest

router = APIRouter(tags=["cash"])


@router.get("/cash-games", response_model=list[CashGameRead])
async def get_cash_games(
    db: Annotated[AsyncSession, Depends(get_db)], viewer: ScheduleViewer
) -> list[CashGameRead]:
    """Кэш-лимиты, которые сборщик видел в последние 45 минут. Гостю — без Editor's Pick
    и диплинков (решение 15.09)."""
    items = await cash_service.list_cash_games(db, now=datetime.now(UTC))
    return items if viewer is not None else cash_for_guest(items)
