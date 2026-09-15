"""Тестовые кэш-лимиты для локального стенда — показать вид CASH до пилота сборщика.

Лимиты живут 45 минут (как у настоящего сборщика), поэтому команда перезапускается перед
показом: `python -m app.seeds.dev_cash`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import async_session_factory, engine
from app.models.cash import CashGame
from app.models.clubs import Club
from app.models.enums import GameType

logger = logging.getLogger(__name__)

# (клуб, игра, SB, BB, столов, диплинк) — блайнды в фишках клуба.
_GAMES: list[tuple[str, GameType, str, str, int, str | None]] = [
    ("ginger", GameType.NLH, "0.1", "0.2", 3, "pppoker://t/1"),
    ("ginger", GameType.NLH, "0.25", "0.5", 2, "pppoker://t/2"),
    ("ginger", GameType.NLH, "1", "2", 1, "pppoker://t/3"),
    ("ginger", GameType.PLO, "0.5", "1", 2, "pppoker://t/4"),
    ("ginger", GameType.PLO5, "1", "2", 1, "pppoker://t/5"),
    ("private-g", GameType.NLH, "0.5", "1", 2, None),
    ("private-g", GameType.PLO, "1", "2", 1, None),
    ("ginger-plus", GameType.NLH, "0.25", "0.5", 1, None),
    ("ginger-plus", GameType.PLO5, "0.5", "1", 1, None),
    ("ginger21", GameType.NLH, "10", "20", 2, None),
    ("ginger21", GameType.NLH, "50", "100", 1, None),
    ("ginger-s", GameType.NLH, "0.25", "0.5", 4, None),
]


async def seed_dev_cash(session: AsyncSession) -> None:
    clubs = {club.slug: club for club in await session.scalars(select(Club))}
    now = datetime.now(UTC)
    await session.execute(delete(CashGame))
    for slug, game, sb, bb, tables, link in _GAMES:
        club = clubs.get(slug)
        if club is None:
            continue
        session.add(
            CashGame(
                club_id=club.id,
                game_type=game,
                small_blind=Decimal(sb),
                big_blind=Decimal(bb),
                tables=tables,
                app_link=link,
                first_seen_at=now,
                seen_at=now,
            )
        )
    await session.flush()
    logger.info("dev cash games seeded")


async def main() -> None:
    if get_settings().app_env != "development":
        raise SystemExit("Тестовый кэш — только для локального стенда")
    async with async_session_factory() as session, session.begin():
        await seed_dev_cash(session)
    await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
