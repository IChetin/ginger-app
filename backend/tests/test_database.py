from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Base
from app.models.clubs import Club
from app.models.references import Currency, Organizer
from app.seeds import seed_reference_data

pytestmark = pytest.mark.integration


async def test_migration_created_tables_and_native_enums(db_session: AsyncSession) -> None:
    table_count = await db_session.scalar(
        text(
            """
            SELECT count(*)
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name != 'alembic_version'
            """
        )
    )
    enum_count = await db_session.scalar(
        text(
            """
            SELECT count(*)
            FROM pg_type
            WHERE typtype = 'e'
              AND typnamespace = 'public'::regnamespace
            """
        )
    )

    # Сверено с базой после удаления модели Day2 (миграция c4e2f7a9b1d3).
    assert table_count == len(Base.metadata.tables)
    # +4 enum сборщика лобби (миграция i0a8e3c7d1f9).
    assert enum_count == 21


async def test_reference_seeds_are_idempotent(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_reference_data(db_session)

    assert await db_session.scalar(select(func.count()).select_from(Currency)) == 5
    # Союзы Ginger APP: NUTS, Black Sea, Poker21, ProSto.
    assert await db_session.scalar(select(func.count()).select_from(Organizer)) == 4
    assert await db_session.scalar(select(func.count()).select_from(Club)) == 6


async def test_club_seed_does_not_resurrect_deleted_clubs(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    ginger = await db_session.scalar(select(Club).where(Club.slug == "ginger"))
    assert ginger is not None
    assert ginger.chip_currency_code == "USDT"
    assert ginger.chip_value == Decimal("1")

    godaddy = await db_session.scalar(select(Club).where(Club.slug == "godaddy"))
    assert godaddy is not None
    assert godaddy.is_visible is False
    await db_session.delete(godaddy)
    await db_session.flush()

    await seed_reference_data(db_session)
    assert await db_session.scalar(select(func.count()).select_from(Club)) == 5
