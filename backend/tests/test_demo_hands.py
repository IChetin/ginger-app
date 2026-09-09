from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.system_accounts import (
    DEMO_HAND_SLUGS,
    DEMO_HANDS_USER_EMAIL,
    DEMO_HANDS_USER_ID,
)
from app.models.auth import User
from app.models.hands import Hand
from app.schemas.hands import HandData
from app.seeds.demo_hands import seed_demo_hands
from app.services.hand_engine import build_timeline, get_state_at_step

pytestmark = pytest.mark.integration


async def test_seed_demo_hands_idempotent(db_session: AsyncSession) -> None:
    await seed_demo_hands(db_session)
    await seed_demo_hands(db_session)
    user = await db_session.get(User, DEMO_HANDS_USER_ID)
    assert user is not None
    assert user.email == DEMO_HANDS_USER_EMAIL
    count = int(
        await db_session.scalar(
            select(func.count()).select_from(Hand).where(Hand.user_id == user.id)
        )
        or 0
    )
    assert count == 3
    slugs = set(await db_session.scalars(select(Hand.slug).where(Hand.user_id == user.id)))
    assert slugs == set(DEMO_HAND_SLUGS)


async def test_demo_hands_are_public_and_replayable(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_demo_hands(db_session)
    for slug in DEMO_HAND_SLUGS:
        response = await client.get(f"/api/v1/hands/{slug}")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["slug"] == slug
        assert body["is_public"] is True
        assert body["is_owner"] is False
        assert body["status"] == "published"
        data = HandData.model_validate(body["data"])
        timeline = build_timeline(data)
        final = get_state_at_step(data, len(timeline) - 1)
        assert final.pot == data.result.pot


async def test_demo_hands_stay_out_of_real_user_lists(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_demo_hands(db_session)
    listed = await editor_client.get("/api/v1/hands")
    assert listed.status_code == 200
    slugs = {item["slug"] for item in listed.json()["items"]}
    assert slugs.isdisjoint(DEMO_HAND_SLUGS)


async def test_system_user_hidden_from_admin_and_cannot_login(
    admin_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_demo_hands(db_session)
    listed = await admin_client.get("/api/v1/admin/users")
    assert listed.status_code == 200
    emails = {item["email"] for item in listed.json()["items"]}
    assert DEMO_HANDS_USER_EMAIL not in emails
    ids = {item["id"] for item in listed.json()["items"]}
    assert str(DEMO_HANDS_USER_ID) not in ids

    otp = await client.post("/api/v1/auth/request-code", json={"email": DEMO_HANDS_USER_EMAIL})
    assert otp.status_code == 404
    assert otp.json()["error"]["code"] == "account_not_found"

    register = await client.post(
        "/api/v1/auth/register/start",
        json={"email": DEMO_HANDS_USER_EMAIL, "privacy_consent": True},
    )
    assert register.status_code == 409
    assert register.json()["error"]["code"] == "account_exists"


async def test_demo_hand_dates_stay_relative(db_session: AsyncSession) -> None:
    await seed_demo_hands(db_session)
    row = await db_session.scalar(select(Hand).where(Hand.slug == "demo-1"))
    assert row is not None
    now = datetime.now(UTC)
    assert now - timedelta(days=3) <= row.created_at <= now - timedelta(days=1)
