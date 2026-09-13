import asyncio
import logging

from app.core.config import get_settings
from app.core.database import async_session_factory, engine
from app.seeds.dev_players import seed_dev_players
from app.seeds.dev_users import seed_dev_users
from app.seeds.runner import seed_reference_data

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


async def main() -> None:
    settings = get_settings()
    async with async_session_factory() as session, session.begin():
        await seed_reference_data(session)
        if settings.app_env == "development":
            await seed_dev_users(session)
            await seed_dev_players(session)
        else:
            logging.getLogger(__name__).info("dev seeds skipped (app_env=%s)", settings.app_env)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
