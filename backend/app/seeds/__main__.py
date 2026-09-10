import asyncio
import logging

from app.core.config import get_settings
from app.core.database import async_session_factory, engine
from app.seeds.demo_schedule import seed_demo_schedule
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
            if settings.seed_demo_data:
                await seed_demo_schedule(session)
                logging.getLogger(__name__).info("sample schedules seeded from docs/rasp_samples")
            else:
                logging.getLogger(__name__).info("sample schedules skipped (seed_demo_data=false)")
        else:
            logging.getLogger(__name__).info(
                "dev seeds skipped (app_env=%s)",
                settings.app_env,
            )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
