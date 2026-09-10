"""Справочник валют.

Раньше жил в трекере как GET /results/currencies. Трекер удалён, а список валют
нужен профилю для выбора базовой валюты — поэтому вынесен отдельно.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.models.references import Currency
from app.schemas.schedule import CurrencyBrief

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("", response_model=list[CurrencyBrief])
async def list_currencies(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CurrencyBrief]:
    del user  # Auth dependency: справочник отдаём только вошедшим, как было в трекере.
    # Базовая валюта профиля пересчитывается по курсам ЦБ, поэтому только ISO-коды: USDT
    # (курс задаётся вручную, для фишек клубов) сюда не попадает.
    currencies = await db.scalars(
        select(Currency).where(func.length(Currency.code) == 3).order_by(Currency.code.asc())
    )
    return [CurrencyBrief(code=item.code, symbol=item.symbol) for item in currencies]
