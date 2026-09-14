"""Лента (этап 7, ТЗ E1): крупные турниры, вечер в каждом клубе и выигрыши игроков.

Турниры не хранятся в ленте отдельно — это выборка из расписания в момент запроса, поэтому
лента всегда совпадает с сеткой. Выигрыши заносит менеджер.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models.auth import User
from app.models.clubs import Club
from app.models.feed import PlayerWin
from app.models.players import Player
from app.models.references import Currency
from app.schemas.feed import FeedRead, WinClub, WinCreate, WinRead
from app.schemas.tournaments import TournamentRead
from app.services.tournaments.queries import DayPeriod, list_tournaments, period_of
from app.services.tournaments.schedule_sync import MSK

MAIN_EVENT_DAYS = 7
EVENING_LOOKAHEAD = timedelta(days=2)
WINS_LIMIT = 20
ANONYMOUS_NICKNAME = "Игрок клуба"


def _guarantee(item: TournamentRead) -> float:
    return float(item.guarantee_rub or 0)


async def main_events(session: AsyncSession, now: datetime) -> list[TournamentRead]:
    """Главное событие каждого дня — максимальная гарантия в рублях (вопрос 11.17)."""
    tournaments = await list_tournaments(
        session, starts_from=now, starts_to=now + timedelta(days=MAIN_EVENT_DAYS)
    )
    best: dict[date, TournamentRead] = {}
    for item in tournaments:
        if item.satellite_target or not item.guarantee_rub or item.starts_at < now:
            continue
        day = item.starts_at.astimezone(MSK).date()
        current = best.get(day)
        if current is None or (_guarantee(item), -item.starts_at.timestamp()) > (
            _guarantee(current),
            -current.starts_at.timestamp(),
        ):
            best[day] = item
    return [best[day] for day in sorted(best)]


async def evening_by_club(session: AsyncSession, now: datetime) -> list[TournamentRead]:
    """Хотя бы один вечерний турнир (18:00–22:00 МСК) из каждого клуба.

    Берём ближайший вечер, в который у клуба есть турниры, и в нём — крупнейшую гарантию.
    Уже идущий турнир с открытой поздней регистрацией тоже подходит: на него ещё можно сесть.
    """
    tournaments = await list_tournaments(
        session, starts_from=now, starts_to=now + EVENING_LOOKAHEAD
    )
    by_club: dict[UUID, TournamentRead] = {}
    for item in tournaments:
        if item.satellite_target or period_of(item.starts_at) != DayPeriod.EVENING:
            continue
        current = by_club.get(item.club.id)
        if current is None:
            by_club[item.club.id] = item
            continue
        item_day = item.starts_at.astimezone(MSK).date()
        current_day = current.starts_at.astimezone(MSK).date()
        if item_day < current_day or (
            item_day == current_day and _guarantee(item) > _guarantee(current)
        ):
            by_club[item.club.id] = item
    return sorted(by_club.values(), key=lambda item: (item.starts_at, item.club.name))


def _win_read(win: PlayerWin, *, public: bool) -> WinRead:
    nickname = win.player_nickname
    if public and win.player is not None and not win.player.results_consent:
        nickname = ANONYMOUS_NICKNAME
    return WinRead(
        id=win.id,
        player_nickname=nickname,
        club=WinClub(id=win.club.id, name=win.club.name, app=win.club.app) if win.club else None,
        tournament_name=win.tournament_name,
        place=win.place,
        prize_amount=win.prize_amount,
        currency_code=win.currency_code,
        currency_symbol=win.currency.symbol if win.currency else None,
        won_on=win.won_on,
    )


async def list_wins(
    session: AsyncSession, *, public: bool, limit: int = WINS_LIMIT
) -> list[WinRead]:
    wins = await session.scalars(
        select(PlayerWin)
        .options(
            selectinload(PlayerWin.player),
            selectinload(PlayerWin.club),
            selectinload(PlayerWin.currency),
        )
        .order_by(PlayerWin.won_on.desc(), PlayerWin.created_at.desc())
        .limit(limit)
    )
    return [_win_read(win, public=public) for win in wins]


async def get_feed(session: AsyncSession, now: datetime | None = None) -> FeedRead:
    moment = now or datetime.now(UTC)
    return FeedRead(
        main_events=await main_events(session, moment),
        evening=await evening_by_club(session, moment),
        wins=await list_wins(session, public=True),
    )


async def create_win(session: AsyncSession, actor: User, body: WinCreate) -> WinRead:
    if await session.get(Currency, body.currency_code) is None:
        raise AppError("unknown_currency", "Неизвестная валюта", 422)
    if body.club_id is not None and await session.get(Club, body.club_id) is None:
        raise AppError("club_not_found", "Клуб не найден", 404)
    if body.player_id is not None and await session.get(Player, body.player_id) is None:
        raise AppError("player_not_found", "Игрок не найден", 404)
    win = PlayerWin(
        player_id=body.player_id,
        player_nickname=body.player_nickname,
        club_id=body.club_id,
        tournament_name=body.tournament_name,
        place=body.place,
        prize_amount=body.prize_amount,
        currency_code=body.currency_code,
        won_on=body.won_on or datetime.now(MSK).date(),
        created_by_user_id=actor.id,
    )
    session.add(win)
    await session.flush()
    await session.refresh(win, attribute_names=["player", "club", "currency"])
    return _win_read(win, public=False)


async def delete_win(session: AsyncSession, win_id: UUID) -> None:
    win = await session.get(PlayerWin, win_id)
    if win is None:
        raise AppError("win_not_found", "Запись не найдена", 404)
    await session.delete(win)
    await session.flush()
