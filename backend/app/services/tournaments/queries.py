"""Расписание глазами игрока: фильтры по приложению, бай-ину в рублях и времени суток (ТЗ §8а.3)."""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.clubs import Club
from app.models.enums import ClubBlock, PokerApp, TournamentStatus
from app.models.tournaments import Tournament
from app.schemas.tournaments import TournamentClub, TournamentRead
from app.services.clubs import rub_per_chip
from app.services.tournaments.schedule_sync import MSK

_FIELDS = tuple(name for name in TournamentRead.model_fields if name in Tournament.__table__.c)


class DayPeriod(StrEnum):
    """Время суток по МСК. ТЗ: день — до 18:00, вечер — 18–22, ночь — от 22:00.

    Ночь продлена до 06:00: турнир в 02:00 — ночной, а не дневной.
    """

    DAY = "day"
    EVENING = "evening"
    NIGHT = "night"


_PERIOD_BOUNDS = {
    DayPeriod.DAY: (time(6, 0), time(18, 0)),
    DayPeriod.EVENING: (time(18, 0), time(22, 0)),
}


def period_of(moment: datetime) -> DayPeriod:
    local = moment.astimezone(MSK).time()
    for period, (start, end) in _PERIOD_BOUNDS.items():
        if start <= local < end:
            return period
    return DayPeriod.NIGHT


async def list_tournaments(
    session: AsyncSession,
    *,
    starts_from: datetime,
    starts_to: datetime,
    apps: set[PokerApp] | None = None,
    club_ids: set[str] | None = None,
    periods: set[DayPeriod] | None = None,
    buyin_rub_min: Decimal | None = None,
    buyin_rub_max: Decimal | None = None,
    include_cancelled: bool = False,
) -> list[TournamentRead]:
    statement = (
        select(Tournament)
        .join(Club, Club.id == Tournament.club_id)
        .options(selectinload(Tournament.club))
        .where(
            Tournament.starts_at >= starts_from,
            Tournament.starts_at < starts_to,
            Club.is_visible.is_(True),
            Club.block == ClubBlock.ONLINE,
        )
        .order_by(Tournament.starts_at, Tournament.is_promoted.desc(), Tournament.name)
    )
    if not include_cancelled:
        statement = statement.where(Tournament.status == TournamentStatus.SCHEDULED)
    if apps:
        statement = statement.where(Club.app.in_(apps))
    if club_ids:
        statement = statement.where(Club.slug.in_(club_ids))
    tournaments = list(await session.scalars(statement))

    clubs = list({item.club.id: item.club for item in tournaments}.values())
    rates = await rub_per_chip(session, clubs)
    by_rub = buyin_rub_min is not None or buyin_rub_max is not None

    result: list[TournamentRead] = []
    for item in tournaments:
        if periods and period_of(item.starts_at) not in periods:
            continue
        rate = rates.get(item.club_id)
        buyin_rub = (item.buyin * rate).quantize(Decimal("1")) if rate is not None else None
        if by_rub:
            # Без курса бай-ин в рублях неизвестен — при фильтре по деньгам такой турнир
            # не показываем, иначе он попадал бы в любой диапазон.
            if buyin_rub is None:
                continue
            if buyin_rub_min is not None and buyin_rub < buyin_rub_min:
                continue
            if buyin_rub_max is not None and buyin_rub > buyin_rub_max:
                continue
        result.append(
            TournamentRead(
                **{name: getattr(item, name) for name in _FIELDS},
                club=TournamentClub(
                    id=item.club.id,
                    name=item.club.name,
                    slug=item.club.slug,
                    app=item.club.app,
                    chip_value=item.club.chip_value,
                    chip_currency_code=item.club.chip_currency_code,
                ),
                buyin_rub=buyin_rub,
                has_addon=item.addon_cost is not None,
            )
        )
    return result
