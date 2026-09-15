"""Тестовые кэш-столы для локального стенда — показать вид экрана CASH до пилота сборщика.

Столы живут 45 минут (как у настоящего сборщика), поэтому команда перезапускается перед
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
from app.models.cash import CashTable
from app.models.clubs import Club
from app.models.enums import GameType

logger = logging.getLogger(__name__)

# (клуб, имя, игра, SB, BB, мест, сидят, ждут, мин. вход, макс. вход, диплинк) — суммы в фишках.
_TABLES: list[tuple[str, str, GameType, str, str, int, int, int, str, str, str | None]] = [
    ("ginger", "Micro Rush", GameType.NLH, "0.1", "0.2", 6, 5, 0, "10", "40", "pppoker://t/1"),
    ("ginger", "Fox Den", GameType.NLH, "0.25", "0.5", 6, 6, 3, "25", "100", "pppoker://t/2"),
    ("ginger", "Red Hot 1/2", GameType.NLH, "1", "2", 6, 4, 0, "100", "400", "pppoker://t/3"),
    ("ginger", "High Roller", GameType.NLH, "2", "5", 6, 3, 0, "250", "1000", "pppoker://t/4"),
    ("ginger", "Omaha Lounge", GameType.PLO, "0.5", "1", 6, 6, 1, "50", "200", "pppoker://t/5"),
    ("ginger", "PLO5 Action", GameType.PLO5, "1", "2", 6, 5, 0, "100", "400", "pppoker://t/6"),
    ("private-g", "Приват 50/100", GameType.NLH, "0.5", "1", 9, 7, 0, "50", "200", None),
    ("private-g", "PLO 100/200", GameType.PLO, "1", "2", 6, 2, 0, "100", "400", None),
    ("ginger-plus", "BS NLH 25/50", GameType.NLH, "0.25", "0.5", 8, 8, 2, "25", "100", None),
    ("ginger-plus", "BS PLO5", GameType.PLO5, "0.5", "1", 6, 4, 0, "50", "200", None),
    ("ginger21", "21 NLH 10/20", GameType.NLH, "10", "20", 6, 6, 0, "1000", "4000", None),
    ("ginger21", "21 NLH 50/100", GameType.NLH, "50", "100", 6, 3, 0, "5000", "20000", None),
]


async def seed_dev_cash(session: AsyncSession) -> None:
    clubs = {club.slug: club for club in await session.scalars(select(Club))}
    now = datetime.now(UTC)
    await session.execute(delete(CashTable))
    for index, row in enumerate(_TABLES, start=1):
        slug, name, game, sb, bb, size, seated, waiting, min_in, max_in, link = row
        club = clubs.get(slug)
        if club is None:
            continue
        session.add(
            CashTable(
                club_id=club.id,
                table_key=f"demo-{index}",
                name=name,
                game_type=game,
                small_blind=Decimal(sb),
                big_blind=Decimal(bb),
                table_size=size,
                seated=seated,
                waiting=waiting,
                min_buyin=Decimal(min_in),
                max_buyin=Decimal(max_in),
                app_link=link,
                first_seen_at=now,
                seen_at=now,
            )
        )
    await session.flush()
    logger.info("dev cash tables seeded")


async def main() -> None:
    if get_settings().app_env != "development":
        raise SystemExit("Тестовые столы — только для локального стенда")
    async with async_session_factory() as session, session.begin():
        await seed_dev_cash(session)
    await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
