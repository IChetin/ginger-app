from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.enums import PokerApp
from app.schemas.clubs import ClubBrief
from app.schemas.tournaments import (
    TournamentRead,
    TournamentReminderRead,
    TournamentRemindersUpdate,
)
from app.services import clubs as clubs_service
from app.services.tournaments import reminders as reminders_service
from app.services.tournaments.queries import DayPeriod, list_highlights, list_tournaments

router = APIRouter(tags=["clubs"])

# Больше двух недель за раз не отдаём: сетка развёрнута на 14 дней вперёд, а сотни турниров
# в неделю — это уже тяжёлый ответ для телефона.
_MAX_RANGE = timedelta(days=15)


@router.get("/clubs", response_model=list[ClubBrief])
async def list_clubs(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ClubBrief]:
    del user
    return await clubs_service.list_public_clubs(db)


@router.get("/tournaments/highlights", response_model=list[TournamentRead])
async def get_highlights(
    db: Annotated[AsyncSession, Depends(get_db)],
    per_day: Annotated[int, Query(ge=1, le=20)] = 5,
    days: Annotated[int, Query(ge=1, le=14)] = 7,
) -> list[TournamentRead]:
    """Витрина для новых: крупнейшие гарантии каждого дня. Без входа — это приманка для тех,
    кто ещё не с нами; остальное расписание по-прежнему только для вошедших."""
    start = datetime.now(UTC)
    return await list_highlights(
        db, starts_from=start, starts_to=start + timedelta(days=days), per_day=per_day
    )


@router.get("/tournaments", response_model=list[TournamentRead])
async def get_tournaments(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    starts_from: Annotated[datetime | None, Query(alias="from")] = None,
    starts_to: Annotated[datetime | None, Query(alias="to")] = None,
    app: Annotated[list[PokerApp] | None, Query()] = None,
    club: Annotated[list[str] | None, Query()] = None,
    period: Annotated[list[DayPeriod] | None, Query()] = None,
    buyin_rub_min: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin_rub_max: Annotated[Decimal | None, Query(ge=0)] = None,
) -> list[TournamentRead]:
    """Ближайшие турниры. По умолчанию — сутки от текущего момента (ТЗ §8а.3: фильтр
    не обязателен, сначала показываем ближайшее по времени)."""
    del user
    start = _aware(starts_from) or datetime.now(UTC)
    end = _aware(starts_to) or start + timedelta(days=1)
    if end <= start:
        raise AppError("invalid_range", "Конец периода раньше начала", 422)
    if end - start > _MAX_RANGE:
        raise AppError("range_too_long", "Период не больше 15 дней", 422)
    return await list_tournaments(
        db,
        starts_from=start,
        starts_to=end,
        apps=set(app) if app else None,
        club_ids=set(club) if club else None,
        periods=set(period) if period else None,
        buyin_rub_min=buyin_rub_min,
        buyin_rub_max=buyin_rub_max,
    )


def _aware(moment: datetime | None) -> datetime | None:
    if moment is None:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


@router.get("/me/tournament-reminders", response_model=list[TournamentReminderRead])
async def list_my_reminders(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TournamentReminderRead]:
    """Колокольчики игрока на турниры, где регистрация ещё открыта."""
    return await reminders_service.list_my_reminders(db, user)


@router.put("/me/tournament-reminders/{tournament_id}", response_model=list[TournamentReminderRead])
async def set_my_reminders(
    tournament_id: UUID,
    body: TournamentRemindersUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TournamentReminderRead]:
    return await reminders_service.set_reminders(db, user, tournament_id, set(body.kinds))
