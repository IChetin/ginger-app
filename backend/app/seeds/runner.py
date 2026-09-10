import logging

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.references import Country, Currency, Organizer, Venue
from app.seeds.data import CLUBS, COUNTRIES, CURRENCIES, ORGANIZERS, VENUES
from app.services.parser_profiles import (
    apply_default_organizer_bindings,
    sync_parser_profiles,
)

logger = logging.getLogger(__name__)


async def seed_reference_data(session: AsyncSession) -> None:
    country_insert = insert(Country).values(COUNTRIES)
    await session.execute(
        country_insert.on_conflict_do_update(
            index_elements=[Country.code],
            set_={"name_ru": country_insert.excluded.name_ru},
        )
    )

    currency_insert = insert(Currency).values(CURRENCIES)
    await session.execute(
        currency_insert.on_conflict_do_update(
            index_elements=[Currency.code],
            set_={"symbol": currency_insert.excluded.symbol},
        )
    )

    organizer_insert = insert(Organizer).values(ORGANIZERS)
    await session.execute(
        organizer_insert.on_conflict_do_update(
            index_elements=[Organizer.slug],
            set_={
                "name": organizer_insert.excluded.name,
                "links": organizer_insert.excluded.links,
            },
        )
    )

    venue_insert = insert(Venue).values(VENUES)
    await session.execute(
        venue_insert.on_conflict_do_update(
            index_elements=[Venue.id],
            set_={
                "country_code": venue_insert.excluded.country_code,
                "city": venue_insert.excluded.city,
                "name": venue_insert.excluded.name,
                "zone": venue_insert.excluded.zone,
                "timezone": venue_insert.excluded.timezone,
            },
        )
    )

    # Клубы — рабочие данные, а не справочник: сеем только в пустую таблицу. Иначе удалённый
    # в админке клуб воскресал бы при каждом db-init, а правки перетирались.
    if await session.scalar(select(func.count()).select_from(Club)) == 0:
        await session.execute(insert(Club).values(CLUBS))

    await sync_parser_profiles(session)
    await apply_default_organizer_bindings(session)

    await session.flush()
    logger.info("reference data seeded")
