"""Самостоятельная регистрация с модерацией (решение Ивана 24.09)."""

from collections.abc import AsyncGenerator

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.auth import User
from app.models.enums import NotificationType, PlayerKind, PlayerStatus
from app.models.notifications import NotificationQueue
from app.models.players import Player
from tests.conftest import login_as

pytestmark = pytest.mark.integration

EMAIL = "newcomer@example.com"
PASSWORD = "Ginger-fox-2026!"


@pytest.fixture
async def moderated(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[None]:
    monkeypatch.setattr(get_settings(), "registration_mode", "moderated")
    yield


async def _register(client: AsyncClient, **extra: str) -> None:
    start = await client.post(
        "/api/v1/auth/register/start", json={"email": EMAIL, "privacy_consent": True}
    )
    assert start.status_code == 200, start.text
    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": EMAIL, "code": get_settings().dev_otp_code},
    )
    assert verify.status_code == 200, verify.text
    complete = await client.post(
        "/api/v1/auth/register/complete",
        json={
            "registration_token": verify.json()["registration_token"],
            "password": PASSWORD,
            "nickname": "newcomer",
            **extra,
        },
    )
    assert complete.status_code == 200, complete.text


async def _login_back(client: AsyncClient) -> None:
    """Вернуться в сессию новичка: повторный код почта не даст — входим паролем."""
    back = await client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert back.status_code == 200, back.text


async def _player(session: AsyncSession) -> Player:
    player = await session.scalar(
        select(Player).join(User, User.id == Player.user_id).where(User.email == EMAIL)
    )
    assert player is not None
    return player


async def test_self_registration_waits_for_moderation(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession, moderated: None
) -> None:
    await _register(
        client,
        real_name="Олег Петров",
        play_nickname="oleg_ru",
        source="друг с офлайна",
    )

    player = await _player(db_session)
    assert player.status is PlayerStatus.PENDING
    assert player.kind is PlayerKind.DEPOSIT
    assert (player.real_name, player.play_nickname, player.source) == (
        "Олег Петров",
        "oleg_ru",
        "друг с офлайна",
    )

    # Менеджерам ушло уведомление о новичке.
    queued = await db_session.scalars(
        select(NotificationQueue).where(NotificationQueue.type == NotificationType.NEW_PLAYER)
    )
    assert [item.payload["title"] for item in queued] == [
        "Новая заявка на вступление: newcomer"
    ] * 2

    me = await client.get("/api/v1/me/player")
    assert me.json()["status"] == "pending"

    # Касса, привязка аккаунта и личная ссылка закрыты — до подтверждения.
    blocked = await client.post(
        "/api/v1/me/chip-requests", json={"items": [{"account_id": str(player.id), "amount": "10"}]}
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "player_pending"
    assert (await client.get("/api/v1/me/referral")).status_code == 403

    # Диалог с менеджером открыт: именно в нём менеджер и расспрашивает новичка.
    thread = await client.post(
        "/api/v1/me/threads", json={"body": "Здравствуйте, играл в Ginger21 год назад"}
    )
    assert thread.status_code == 201, thread.text


async def test_manager_approves_and_access_opens(
    client: AsyncClient,
    seeded_db: None,
    db_session: AsyncSession,
    moderated: None,
) -> None:
    await _register(client, play_nickname="oleg_ru")
    player = await _player(db_session)

    # Клиент в тестах один: переключаем вход на менеджера и обратно.
    admin_client = client
    await login_as(client, get_settings().seed_admin_email)
    listed = await admin_client.get("/api/v1/admin/players")
    pending = [item for item in listed.json() if item["status"] == "pending"]
    assert [item["play_nickname"] for item in pending] == ["oleg_ru"]

    approved = await admin_client.post(
        f"/api/v1/admin/players/{player.id}/approve",
        json={"kind": "credit", "offline_access": True},
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert (body["status"], body["kind"], body["offline_access"]) == ("active", "credit", True)
    assert body["moderated_at"] is not None

    # Игроку ушло уведомление, доступ открылся.
    approvals = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.type == NotificationType.PLAYER_APPROVED,
            NotificationQueue.user_id == player.user_id,
        )
    )
    assert approvals == 1

    # Второй раз ту же заявку не рассмотреть.
    again = await admin_client.post(f"/api/v1/admin/players/{player.id}/approve", json={})
    assert again.status_code == 422
    assert again.json()["error"]["code"] == "not_pending"

    # Игрок вернулся: личная ссылка и касса открыты.
    await _login_back(client)
    assert (await client.get("/api/v1/me/referral")).status_code == 200


async def test_manager_rejects(
    client: AsyncClient,
    seeded_db: None,
    db_session: AsyncSession,
    moderated: None,
) -> None:
    await _register(client)
    player = await _player(db_session)

    admin_client = client
    await login_as(client, get_settings().seed_admin_email)
    rejected = await admin_client.post(
        f"/api/v1/admin/players/{player.id}/reject", json={"reason": "не наш профиль"}
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert "не наш профиль" in (rejected.json()["notes"] or "")

    await _login_back(client)
    assert (await client.get("/api/v1/me/player")).json()["status"] == "rejected"
    denied = await client.post("/api/v1/me/threads", json={"body": "а почему?"})
    assert denied.status_code == 403


async def test_registration_mode_is_published_and_invite_stays_default(
    client: AsyncClient, seeded_db: None
) -> None:
    default = await client.get("/api/v1/auth/register/mode")
    assert default.json() == {"mode": "invite", "invite_required": True, "moderated": False}

    without_invite = await client.post(
        "/api/v1/auth/register/start", json={"email": EMAIL, "privacy_consent": True}
    )
    assert without_invite.status_code == 403
    assert without_invite.json()["error"]["code"] == "invite_required"


async def test_mode_moderated_is_published(
    client: AsyncClient, seeded_db: None, moderated: None
) -> None:
    mode = await client.get("/api/v1/auth/register/mode")
    assert mode.json() == {"mode": "moderated", "invite_required": False, "moderated": True}
