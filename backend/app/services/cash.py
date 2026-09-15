"""Кэш-игры: вечерний сборщик присылает лимиты клуба и число столов, игрок видит, где игра.

Решения Ивана 15.09: сборщик смотрит только экран списка столов, в стол заходит лишь за
диплинком PPPoker; игроков и места не показываем — их не обновить честно.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.cash import CashGame
from app.models.clubs import Club
from app.models.collector import CollectorRun, CollectorSnapshot
from app.models.enums import ClubBlock, CollectorRunKind, CollectorRunStatus, GameType
from app.schemas.cash import CashGameRead, CashSnapshotIn, CashSnapshotResult
from app.schemas.tournaments import TournamentClub
from app.services.clubs import rub_per_chip
from app.services.picks import active_picks, match_cash

# Проход раз в 15–20 минут: лимит, не виденный 45 минут, пропустил два прохода подряд —
# сборщик сломался или вечер кончился. Устаревшее игроку не показываем.
FRESH_FOR = timedelta(minutes=45)
_CENT = Decimal("0.01")


def _key(game_type: GameType, small_blind: Decimal, big_blind: Decimal) -> tuple[str, ...]:
    return (game_type.value, str(small_blind.quantize(_CENT)), str(big_blind.quantize(_CENT)))


async def ingest_cash_snapshot(
    session: AsyncSession, run_id: uuid.UUID, body: CashSnapshotIn
) -> CashSnapshotResult:
    run = await session.get(CollectorRun, run_id)
    if run is None:
        raise NotFoundError("Проход сборщика не найден")
    if run.status is not CollectorRunStatus.RUNNING:
        raise AppError("run_finished", "Проход уже завершён", 409)
    if run.kind is not CollectorRunKind.CASH:
        raise AppError("run_kind_mismatch", "Кэш присылается в проходе вида cash", 422)
    club = await session.scalar(select(Club).where(Club.slug == body.club_slug))
    if club is None:
        raise NotFoundError("Клуб не найден")
    if club.app is not run.app:
        raise AppError("club_app_mismatch", "Клуб из другого приложения", 422)

    now = datetime.now(UTC)
    session.add(
        CollectorSnapshot(
            run_id=run.id,
            club_id=club.id,
            captured_at=now,
            window_from=now,
            window_to=now,
            payload={"games": [game.model_dump(mode="json") for game in body.games]},
            summary={},
        )
    )

    existing = {
        _key(game.game_type, game.small_blind, game.big_blind): game
        for game in await session.scalars(select(CashGame).where(CashGame.club_id == club.id))
    }
    result = CashSnapshotResult()
    for incoming in body.games:
        game = existing.pop(
            _key(incoming.game_type, incoming.small_blind, incoming.big_blind), None
        )
        if game is None:
            session.add(
                CashGame(
                    club_id=club.id,
                    game_type=incoming.game_type,
                    small_blind=incoming.small_blind,
                    big_blind=incoming.big_blind,
                    tables=incoming.tables,
                    app_link=incoming.app_link,
                    first_seen_at=now,
                    seen_at=now,
                )
            )
            result.added += 1
            continue
        game.tables = incoming.tables
        # За диплинком сборщик заходит в стол не каждый проход — пустая ссылка известную не стирает.
        if incoming.app_link:
            game.app_link = incoming.app_link
        game.seen_at = now
        result.updated += 1

    if existing:
        await session.execute(
            delete(CashGame).where(CashGame.id.in_([game.id for game in existing.values()]))
        )
        result.closed = len(existing)

    run.stats = {**run.stats, "snapshots": int(run.stats.get("snapshots", 0)) + 1}
    await session.flush()
    return result


def _to_rub(chips: Decimal, rate: Decimal | None) -> Decimal | None:
    return None if rate is None else (chips * rate).quantize(Decimal("1"))


async def list_cash_games(session: AsyncSession, *, now: datetime) -> list[CashGameRead]:
    games = list(
        await session.scalars(
            select(CashGame)
            .join(Club, Club.id == CashGame.club_id)
            .options(selectinload(CashGame.club).selectinload(Club.chip_currency))
            .where(
                CashGame.seen_at >= now - FRESH_FOR,
                Club.is_visible.is_(True),
                Club.block == ClubBlock.ONLINE,
            )
            .order_by(Club.sort_order, CashGame.game_type, CashGame.big_blind)
        )
    )
    clubs = list({game.club_id: game.club for game in games}.values())
    rates = await rub_per_chip(session, clubs)
    picks = await active_picks(session, "cash")
    result: list[CashGameRead] = []
    for game in games:
        pick = match_cash(picks, game)
        result.append(
            CashGameRead(
                id=game.id,
                club=TournamentClub(
                    id=game.club.id,
                    name=game.club.name,
                    slug=game.club.slug,
                    app=game.club.app,
                    app_club_id=game.club.app_club_id,
                    chip_value=game.club.chip_value,
                    chip_currency_code=game.club.chip_currency_code,
                    currency_symbol=game.club.chip_currency.symbol
                    if game.club.chip_currency
                    else None,
                ),
                game_type=game.game_type,
                small_blind=game.small_blind,
                big_blind=game.big_blind,
                tables=game.tables,
                app_link=game.app_link,
                seen_at=game.seen_at,
                big_blind_rub=_to_rub(game.big_blind, rates.get(game.club_id)),
                is_editor_pick=pick is not None,
                editor_pick_note=pick.note if pick else None,
            )
        )
    return result
