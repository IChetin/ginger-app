from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.main import app
from app.models.auth import User
from app.models.enums import PlayerKind, PlayerStatus, UserRole
from app.models.players import Player
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _player(db: AsyncSession, nickname: str, kind: PlayerKind = PlayerKind.CREDIT) -> Player:
    user = User(
        email=f"{nickname}@example.com",
        nickname=nickname,
        role=UserRole.USER,
        email_verified_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    player = Player(user_id=user.id, kind=kind)
    db.add(player)
    await db.flush()
    return player


async def _register(client: AsyncClient, email: str, nickname: str, token: str) -> int:
    start = await client.post(
        "/api/v1/auth/register/start",
        json={"email": email, "privacy_consent": True, "invite_token": token},
    )
    if start.status_code != 200:
        return start.status_code
    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": email, "code": get_settings().dev_otp_code},
    )
    assert verify.status_code == 200, verify.text
    complete = await client.post(
        "/api/v1/auth/register/complete",
        json={
            "registration_token": verify.json()["registration_token"],
            "password": "Ginger-fox-2026!",
            "nickname": nickname,
            "invite_token": token,
        },
    )
    return complete.status_code


async def test_friend_registers_by_personal_link_as_deposit(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    host = await _player(db_session, "host")
    await login_as(client, "host@example.com")
    referral = (await client.get("/api/v1/me/referral")).json()
    assert referral["path"] == f"/r/{referral['code']}"
    assert len(referral["code"]) == 8
    assert referral["invited_total"] == 0 and referral["paused"] is False
    # Код выдаётся один раз и не меняется между заходами.
    assert (await client.get("/api/v1/me/referral")).json()["code"] == referral["code"]
    await client.post("/api/v1/auth/logout")

    check = (await client.get(f"/api/v1/invites/{referral['code']}")).json()
    assert check == {"valid": True, "reason": None, "referrer_nickname": "host"}

    status = await _register(client, "friend@example.com", "friend", referral["code"])
    assert status == 200
    friend = await db_session.scalar(
        select(Player).join(User, User.id == Player.user_id).where(User.nickname == "friend")
    )
    assert friend is not None
    assert friend.kind is PlayerKind.DEPOSIT
    assert friend.referrer_player_id == host.id


async def test_link_pauses_after_daily_limit_and_rotation_kills_old_code(
    client: AsyncClient,
    seeded_db: None,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "referral_daily_limit", 1)
    await _player(db_session, "leaky")
    await login_as(client, "leaky@example.com")
    code = (await client.get("/api/v1/me/referral")).json()["code"]
    await client.post("/api/v1/auth/logout")

    assert await _register(client, "one@example.com", "one", code) == 200
    await client.post("/api/v1/auth/logout")
    assert (await client.get(f"/api/v1/invites/{code}")).json()["reason"] == "paused"
    assert await _register(client, "two@example.com", "two", code) == 403

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as admin:
        await login_as(admin, get_settings().seed_admin_email)
        players = (await admin.get("/api/v1/admin/players")).json()
        leaky = next(item for item in players if item["nickname"] == "leaky")
        assert leaky["invited_total"] == 1 and leaky["referral_paused"] is True
        rotated = await admin.post(f"/api/v1/admin/players/{leaky['id']}/referral/rotate")
        assert rotated.status_code == 200, rotated.text
        assert rotated.json()["code"] != code

    assert (await client.get(f"/api/v1/invites/{code}")).json()["reason"] == "not_found"


async def test_blocked_player_link_does_not_work(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    player = await _player(db_session, "gone")
    await login_as(client, "gone@example.com")
    code = (await client.get("/api/v1/me/referral")).json()["code"]
    await client.post("/api/v1/auth/logout")
    player.status = PlayerStatus.BLOCKED
    await db_session.flush()
    assert (await client.get(f"/api/v1/invites/{code}")).json()["valid"] is False
    assert await _register(client, "late@example.com", "late", code) == 403
