import os
import subprocess
from collections.abc import AsyncGenerator, Generator
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.main import app
from app.models.auth import User
from app.seeds import seed_reference_data
from app.seeds.data import ORGANIZERS
from app.seeds.dev_users import seed_dev_users


def _test_database_url() -> str:
    url = get_settings().test_database_url
    database = make_url(url).database or ""
    if not database.endswith("_test"):
        raise RuntimeError("Test database name must end with '_test'")
    return url


@pytest.fixture(scope="session")
def migrated_database() -> Generator[None]:
    env = os.environ.copy()
    env["DATABASE_URL"] = _test_database_url()
    subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        check=True,
        env=env,
    )
    yield


@pytest_asyncio.fixture
async def test_engine(migrated_database: None) -> AsyncGenerator[AsyncEngine]:
    engine = create_async_engine(_test_database_url(), pool_pre_ping=True)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with session_factory() as session:
            yield session
        await transaction.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def login_as(
    client: AsyncClient,
    email: str,
    *,
    settings: Settings | None = None,
) -> dict[str, str]:
    """OTP-логин: request-code + verify, возвращает cookies сессии."""
    cfg = settings or get_settings()
    request = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert request.status_code == 200, request.text
    verify = await client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": cfg.dev_otp_code},
    )
    assert verify.status_code == 200, verify.text
    return dict(verify.cookies)


def seed_organizer_id(index: int = 0) -> UUID:
    return ORGANIZERS[index]["id"]


@pytest_asyncio.fixture
async def seeded_db(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)


@pytest_asyncio.fixture
async def admin_client(
    client: AsyncClient,
    seeded_db: None,
) -> AsyncGenerator[AsyncClient]:
    settings = get_settings()
    await login_as(client, settings.seed_admin_email)
    yield client


@pytest_asyncio.fixture
async def editor_client(
    client: AsyncClient,
    seeded_db: None,
) -> AsyncGenerator[AsyncClient]:
    settings = get_settings()
    await login_as(client, settings.seed_editor_email)
    yield client


@pytest_asyncio.fixture
async def user_client(
    client: AsyncClient,
    seeded_db: None,
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncClient]:
    # Вход по коду аккаунт не создаёт, а seed_dev_users заводит только admin и editor.
    # В исходнике Day2 фикстура логинила несуществующего игрока и падала на
    # account_not_found — тесты «игрок не пускается в админку» фактически не выполнялись.
    db_session.add(User(email="player@example.com", nickname="player"))
    await db_session.flush()
    await login_as(client, "player@example.com")
    yield client
