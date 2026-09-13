from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.password_policy import is_common_password
from app.core.security import hash_password, verify_password
from app.models.auth import OtpCode, User
from app.models.enums import UserRole
from app.seeds import seed_reference_data
from app.services.email.mock import MockEmailProvider


@pytest.fixture(autouse=True)
def _registration_without_invite(monkeypatch: pytest.MonkeyPatch) -> None:
    # Тесты регистрации Day2 — без инвайта; регистрация по инвайту — в test_chips_api.
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "registration_requires_invite", False)


pytestmark = pytest.mark.integration

PASSWORD = "CorrectHorseBattery1"
NICKNAME = "newplayer"


def test_password_hash_roundtrip() -> None:
    hashed = hash_password(PASSWORD)
    assert verify_password(PASSWORD, hashed)
    assert not verify_password("wrong-password-xx", hashed)


def test_common_password_rejected() -> None:
    assert is_common_password("password")
    assert is_common_password("Password")


async def _register_flow(
    client: AsyncClient,
    *,
    email: str,
    password: str = PASSWORD,
    nickname: str = NICKNAME,
) -> dict:
    settings = get_settings()
    start = await client.post(
        "/api/v1/auth/register/start",
        json={"email": email, "privacy_consent": True},
    )
    assert start.status_code == 200, start.text

    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 200, verify.text
    token = verify.json()["registration_token"]

    complete = await client.post(
        "/api/v1/auth/register/complete",
        json={
            "registration_token": token,
            "password": password,
            "nickname": nickname,
        },
    )
    assert complete.status_code == 200, complete.text
    return complete.json()


async def test_register_start_rejects_existing(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    email = "exists@example.com"
    db_session.add(
        User(
            email=email,
            nickname="exists_user",
            role=UserRole.USER,
            email_verified_at=datetime.now(UTC),
        )
    )
    await db_session.flush()

    with patch("app.services.auth.get_email_provider") as provider_factory:
        mock = AsyncMock(spec=MockEmailProvider)
        mock.name = "mock"
        provider_factory.return_value = mock
        response = await client.post(
            "/api/v1/auth/register/start",
            json={"email": email, "privacy_consent": True},
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "account_exists"
    assert "уже есть" in response.json()["error"]["message"].lower()
    mock.send_code.assert_not_called()


async def test_register_full_flow_and_login(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)
    email = "fresh@example.com"

    before = await db_session.scalar(select(User).where(User.email == email))
    assert before is None

    start = await client.post(
        "/api/v1/auth/register/start",
        json={"email": email, "privacy_consent": True},
    )
    assert start.status_code == 200
    # Still no user until complete.
    assert await db_session.scalar(select(User).where(User.email == email)) is None
    assert await db_session.scalar(select(OtpCode).where(OtpCode.email == email)) is not None

    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 200
    token = verify.json()["registration_token"]
    assert await db_session.scalar(select(User).where(User.email == email)) is None

    complete = await client.post(
        "/api/v1/auth/register/complete",
        json={
            "registration_token": token,
            "password": PASSWORD,
            "nickname": NICKNAME,
        },
    )
    assert complete.status_code == 200, complete.text
    user = complete.json()
    assert user["email"] == email
    assert user["has_password"] is True
    assert user["email_verified"] is True
    assert user["nickname"] == NICKNAME

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]

    await client.post("/api/v1/auth/logout")

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert login.status_code == 200
    assert login.json()["id"] == user["id"]

    bad = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "WrongPassword99"},
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"
    assert bad.json()["error"]["message"] == "Неверный email или пароль"


async def test_register_requires_consent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    response = await client.post(
        "/api/v1/auth/register/start",
        json={"email": "noconsent@example.com", "privacy_consent": False},
    )
    assert response.status_code == 422


async def test_register_common_password_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    email = "commonpw@example.com"
    settings = get_settings()

    start = await client.post(
        "/api/v1/auth/register/start",
        json={"email": email, "privacy_consent": True},
    )
    assert start.status_code == 200
    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    token = verify.json()["registration_token"]
    complete = await client.post(
        "/api/v1/auth/register/complete",
        json={
            "registration_token": token,
            "password": "password",
            "nickname": "commoner",
        },
    )
    assert complete.status_code == 422


async def test_otp_only_user_set_password_then_login(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)
    email = "otponly@example.com"
    db_session.add(
        User(
            email=email,
            nickname="otponly",
            role=UserRole.USER,
            email_verified_at=datetime.now(UTC),
            password_hash=None,
        )
    )
    await db_session.flush()

    request = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert request.status_code == 200
    verify = await client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 200
    assert verify.json()["has_password"] is False

    set_pw = await client.post(
        "/api/v1/auth/set-password",
        json={"password": PASSWORD},
    )
    assert set_pw.status_code == 200
    assert set_pw.json()["has_password"] is True

    await client.post("/api/v1/auth/logout")
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert login.status_code == 200


async def test_password_login_lockout(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)
    email = "lockout@example.com"
    await _register_flow(client, email=email, nickname="lockout_u")
    await client.post("/api/v1/auth/logout")

    for _ in range(settings.password_login_max_attempts):
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword99"},
        )
        assert response.status_code == 401

    locked = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert locked.status_code == 429
    assert "попыток" in locked.json()["error"]["message"].lower()


async def test_login_unknown_email_generic_error(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nosuch@example.com", "password": PASSWORD},
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Неверный email или пароль"


async def test_account_lookup_captcha_after_probes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)

    for i in range(settings.account_lookup_captcha_after_count):
        response = await client.post(
            "/api/v1/auth/request-code",
            json={"email": f"probe{i}@example.com"},
        )
        assert response.status_code == 404

    blocked = await client.post(
        "/api/v1/auth/request-code",
        json={"email": "probeN@example.com"},
    )
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "captcha_required"

    with_captcha = await client.post(
        "/api/v1/auth/request-code",
        json={
            "email": "probeN@example.com",
            "captcha_token": settings.captcha_mock_token,
        },
    )
    assert with_captcha.status_code == 404


async def test_change_password(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    email = "changer@example.com"
    await _register_flow(client, email=email, nickname="changer")

    changed = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": PASSWORD,
            "new_password": "AnotherGoodPass9",
        },
    )
    assert changed.status_code == 200

    await client.post("/api/v1/auth/logout")
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "AnotherGoodPass9"},
    )
    assert login.status_code == 200
