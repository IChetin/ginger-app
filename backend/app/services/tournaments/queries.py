"""Расписание глазами игрока: фильтры по приложению, бай-ину в рублях и времени суток (ТЗ §8а.3)."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.clubs import Club
from app.models.enums import ClubBlock, PokerApp, TournamentStatus
from app.models.tournaments import Tournament
from app.schemas.tournaments import LiveEventRead, TournamentClub, TournamentRead
from app.services.clubs import rub_per_chip
from app.services.tournaments.late_reg import late_reg_close_offset
from app.services.tournaments.schedule_sync import MSK

_FIELDS = tuple(name for name in TournamentRead.model_fields if name in Tournament.__table__.c)


def _early_bird_closes_at(item: Tournament) -> datetime | None:
    """Старт + N уровней Early Bird с часовыми перерывами — так же, как у поздней регистрации."""
    if not item.early_bird_levels:
        return None
    offset = late_reg_close_offset(
        item.starts_at.minute, item.early_bird_levels, item.level_minutes
    )
    return item.starts_at + timedelta(minutes=offset) if offset is not None else None


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


_DOLLAR_CODES = frozenset({"USD", "USDT"})


def is_minor_satellite(tournament: Tournament, rub_per_chip: Decimal | None) -> bool:
    """Сателлит на турнир дешевле $100 / 5 000 ₽.

    Цена целевого турнира — номинал билета (`ticket_value`) в деньгах клуба. Долларовые клубы
    сравниваются с порогом в долларах, остальные — в рублях. Без номинала или курса судить
    не о чем — сателлит показываем.
    """
    if tournament.ticket_value is None:
        return False
    club = tournament.club
    settings = get_settings()
    if club.chip_value is not None and club.chip_currency_code in _DOLLAR_CODES:
        return tournament.ticket_value * club.chip_value < settings.minor_satellite_below_usd
    if rub_per_chip is None:
        return False
    return tournament.ticket_value * rub_per_chip < settings.minor_satellite_below_rub


def _to_rub(chips: Decimal | None, rate: Decimal | None) -> Decimal | None:
    if chips is None or rate is None:
        return None
    return (chips * rate).quantize(Decimal("1"))


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
    include_minor_satellites: bool = False,
    live: bool = False,
) -> list[TournamentRead]:
    statement = (
        select(Tournament)
        .join(Club, Club.id == Tournament.club_id)
        .options(selectinload(Tournament.club).selectinload(Club.chip_currency))
        .where(
            # Уже идущий турнир показываем, пока открыта поздняя регистрация: «ещё 47 минут»
            # — главный повод открыть расписание прямо сейчас (ТЗ §8а.3.1).
            or_(
                Tournament.starts_at >= starts_from,
                Tournament.late_reg_closes_at > starts_from,
            ),
            Tournament.starts_at < starts_to,
            Club.is_visible.is_(True),
            Club.block == ClubBlock.ONLINE,
        )
        .order_by(Tournament.starts_at, Tournament.is_promoted.desc(), Tournament.name)
    )
    if not include_cancelled:
        statement = statement.where(Tournament.status == TournamentStatus.SCHEDULED)
    # Путь в живые серии живёт отдельным блоком LIVE и в онлайн-расписание не попадает.
    statement = statement.where(
        Tournament.live_event.is_not(None) if live else Tournament.live_event.is_(None)
    )
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
        if not include_minor_satellites and is_minor_satellite(item, rate):
            continue
        buyin_rub = _to_rub(item.buyin, rate)
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
                    currency_symbol=(
                        item.club.chip_currency.symbol if item.club.chip_currency else None
                    ),
                ),
                buyin_rub=buyin_rub,
                guarantee_rub=_to_rub(item.guarantee, rate),
                has_addon=item.addon_cost is not None or item.addon_terms is not None,
                early_bird_closes_at=_early_bird_closes_at(item),
            )
        )
    return result


async def list_highlights(
    session: AsyncSession,
    *,
    starts_from: datetime,
    starts_to: datetime,
    per_day: int,
) -> list[TournamentRead]:
    """Яркие события для новых игроков: максимальные гарантии (решение Ивана 2026-09-13).

    Гарантии сравниваются в рублях — иначе клубы несравнимы ($1 000 у Ginger и ₽50 000 у
    Ginger21). Берём `per_day` крупнейших на каждый день по Москве; турниры без гарантии или
    без курса клуба в отбор не попадают.
    """
    tournaments = await list_tournaments(session, starts_from=starts_from, starts_to=starts_to)
    by_day: dict[str, list[TournamentRead]] = {}
    for item in tournaments:
        if item.guarantee_rub is None or item.guarantee_rub <= 0:
            continue
        day = item.starts_at.astimezone(MSK).date().isoformat()
        by_day.setdefault(day, []).append(item)
    result: list[TournamentRead] = []
    for items in by_day.values():
        items.sort(key=lambda item: (-(item.guarantee_rub or 0), item.starts_at))
        result.extend(items[:per_day])
    result.sort(key=lambda item: item.starts_at)
    return result


LIVE_LOOKAHEAD = timedelta(days=45)


async def list_live_events(session: AsyncSession, *, now: datetime) -> list[LiveEventRead]:
    """Путь в живые серии (он-офф турниры X-Poker), сгруппированный по событию.

    Шаги и сам турнир серии идут по времени; события — по ближайшему шагу.
    """
    items = await list_tournaments(
        session,
        starts_from=now,
        starts_to=now + LIVE_LOOKAHEAD,
        include_minor_satellites=True,
        live=True,
    )
    groups: dict[tuple[UUID, str], LiveEventRead] = {}
    for item in items:
        if item.live_event is None:
            continue
        key = (item.club.id, item.live_event)
        group = groups.get(key)
        if group is None:
            group = LiveEventRead(title=item.live_event, dates=None, club=item.club, items=[])
            groups[key] = group
        group.dates = group.dates or item.live_dates
        group.items.append(item)
    return sorted(groups.values(), key=lambda group: group.items[0].starts_at)


async def list_satellites(
    session: AsyncSession, tournament_id: UUID, *, now: datetime
) -> list[TournamentRead]:
    """Сателлиты на турнир для карточки «попасть дешевле» — мелкие тоже, здесь они к месту.

    Цель сателлита сравнивается и с именем с афиши, и с именем из лобби, без учёта регистра.
    """
    target = await session.scalar(select(Tournament).where(Tournament.id == tournament_id))
    if target is None or target.starts_at <= now:
        return []
    names = {name.strip().lower() for name in (target.name, target.lobby_name) if name}
    items = await list_tournaments(
        session,
        starts_from=now,
        starts_to=target.starts_at,
        include_minor_satellites=True,
    )
    return [
        item
        for item in items
        if item.club.id == target.club_id
        and item.satellite_target is not None
        and item.satellite_target.strip().lower() in names
    ]
