"""Integration tests for GET /api/v1/stats/share-card.png."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.auth import User
from app.models.references import FxRate
from app.models.schedule import Event, Series
from app.models.tracker import Result
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import DEMO_EVENT_MAIN_ID, seed_demo_schedule
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _prepare(db_session: AsyncSession) -> User:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_demo_schedule(db_session)
    settings = get_settings()
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    user.base_currency = "RUB"
    await db_session.flush()
    return user


async def _seed_result(db_session: AsyncSession, user: User) -> None:
    db_session.add(
        FxRate(currency_code="USD", rate_date=date(2024, 6, 10), rate_rub=Decimal("90.000000"))
    )
    event = await db_session.scalar(
        select(Event)
        .where(Event.id == DEMO_EVENT_MAIN_ID)
        .options(selectinload(Event.series).selectinload(Series.venue))
    )
    assert event is not None
    db_session.add(
        Result(
            user_id=user.id,
            event_id=event.id,
            name="#1 Main Event",
            venue_text=event.series.venue.name,
            series_text=event.series.name,
            played_on=date(2024, 6, 10),
            buyin=Decimal("10000.00"),
            currency_code="RUB",
            entries_count=1,
            payout=Decimal("30000.00"),
            place=2,
            field_size=100,
        )
    )
    await db_session.flush()


async def test_share_card_png_and_cache(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache_dir = tmp_path / "pdf-cache"
    monkeypatch.setenv("PDF_CACHE_DIR", str(cache_dir))
    get_settings.cache_clear()

    user = await _prepare(db_session)
    await _seed_result(db_session, user)
    await login_as(client, user.email)

    first = await client.get("/api/v1/stats/share-card.png")
    assert first.status_code == 200, first.text
    assert first.headers["content-type"].startswith("image/png")
    assert first.headers["x-share-cache"] == "MISS"
    assert first.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert "Day2_stats" in first.headers.get("content-disposition", "")

    # PNG dimensions 1080×1080
    import io

    from PIL import Image

    image = Image.open(io.BytesIO(first.content))
    assert image.size == (1080, 1080)

    second = await client.get("/api/v1/stats/share-card.png")
    assert second.status_code == 200
    assert second.headers["x-share-cache"] == "HIT"
    assert second.content == first.content

    get_settings.cache_clear()


async def test_share_card_empty_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _prepare(db_session)
    await login_as(client, user.email)
    response = await client.get("/api/v1/stats/share-card.png")
    assert response.status_code == 404


async def test_share_card_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stats/share-card.png")
    assert response.status_code == 401
