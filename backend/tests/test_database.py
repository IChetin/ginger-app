from datetime import UTC
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.references import Country, Currency, Organizer, Venue
from app.models.schedule import Flight
from app.seeds import seed_reference_data
from tests.factories import FlightFactory, persist

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

    assert table_count == 19
    assert enum_count == 14


async def test_reference_seeds_are_idempotent(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_reference_data(db_session)

    assert await db_session.scalar(select(func.count()).select_from(Country)) == 3
    assert await db_session.scalar(select(func.count()).select_from(Currency)) == 4
    assert await db_session.scalar(select(func.count()).select_from(Organizer)) == 4
    assert await db_session.scalar(select(func.count()).select_from(Venue)) == 4


async def test_schedule_factory_persists_decimal_and_aware_time(
    db_session: AsyncSession,
) -> None:
    flight = await persist(db_session, FlightFactory())
    flight_id = flight.id
    db_session.expire_all()

    stored = await db_session.scalar(
        select(Flight).options(selectinload(Flight.event)).where(Flight.id == flight_id)
    )

    assert stored is not None
    assert stored.start_at.tzinfo is not None
    assert stored.start_at.utcoffset() == UTC.utcoffset(stored.start_at)
    assert isinstance(stored.event.buyin, Decimal)
    assert stored.label is None


async def test_series_delete_cascades_to_event_and_flight(
    db_session: AsyncSession,
) -> None:
    flight = await persist(db_session, FlightFactory())
    await db_session.delete(flight.event.series)
    await db_session.flush()

    remaining = await db_session.scalar(
        select(func.count()).select_from(Flight).where(Flight.id == flight.id)
    )
    assert remaining == 0
