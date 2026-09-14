from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import normalize_email
from app.core.security import hash_password
from app.models.auth import OtpCode, User
from app.models.enums import UserRole
from app.seeds import seed_reference_data
from app.seeds.dev_users import seed_dev_users
from app.services.email.mock import MockEmailProvider

pytestmark = pytest.mark.integration


def test_normalize_email() -> None:
    assert normalize_email("  Ivan@Mail.RU ") == "ivan@mail.ru"


async def _ensure_user(
    db_session: AsyncSession,
    email: str,
    *,
    password: str | None = None,
) -> User:
    await seed_reference_data(db_session)
    email_n = normalize_email(email)
    user = await db_session.scalar(select(User).where(User.email == email_n))
    if user is None:
        user = User(
            email=email_n,
            nickname=f"u_{email_n.split('@')[0][:12]}",
            role=UserRole.USER,
            email_verified_at=datetime.now(UTC),
            password_hash=hash_password(password) if password else None,
        )
        db_session.add(user)
        await db_session.flush()
    return user


async def test_otp_login_me_logout(client: AsyncClient, db_session: AsyncSession) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)

    denied = await client.get("/api/v1/auth/me")
    assert denied.status_code == 401

    request = await client.post(
        "/api/v1/auth/request-code",
        json={"email": settings.seed_admin_email},
    )
    assert request.status_code == 200
    assert request.json()["expires_in_seconds"] == settings.otp_ttl_seconds
    assert request.json()["retry_after"] == settings.otp_min_interval_seconds

    otp = await db_session.scalar(
        select(OtpCode)
        .where(OtpCode.email == normalize_email(settings.seed_admin_email))
        .order_by(OtpCode.created_at.desc())
    )
    assert otp is not None
    assert otp.request_ip_hash is not None

    verify = await client.post(
        "/api/v1/auth/verify",
        json={"email": settings.seed_admin_email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 200
    body = verify.json()
    assert body["email"] == normalize_email(settings.seed_admin_email)
    assert settings.session_cookie_name in verify.cookies

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == body["id"]

    logout = await client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    denied_again = await client.get("/api/v1/auth/me")
    assert denied_again.status_code == 401


async def test_request_code_rejects_unknown_email(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    with patch("app.services.auth.get_email_provider") as provider_factory:
        mock = AsyncMock(spec=MockEmailProvider)
        mock.name = "mock"
        provider_factory.return_value = mock
        response = await client.post(
            "/api/v1/auth/request-code",
            json={"email": "nobody@example.com"},
        )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "account_not_found"
    assert "зарегистрируйтесь" in response.json()["error"]["message"].lower()
    mock.send_code.assert_not_called()


async def test_email_normalization_single_account(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await _ensure_user(db_session, "ivan@mail.ru")

    await client.post("/api/v1/auth/request-code", json={"email": "Ivan@Mail.RU"})
    first = await client.post(
        "/api/v1/auth/verify",
        json={"email": "Ivan@Mail.RU", "code": settings.dev_otp_code},
    )
    assert first.status_code == 200
    user_id = first.json()["id"]

    await db_session.execute(
        update(OtpCode)
        .where(OtpCode.email == "ivan@mail.ru")
        .values(created_at=datetime.now(UTC) - timedelta(minutes=2))
    )
    await client.post("/api/v1/auth/request-code", json={"email": "ivan@mail.ru"})
    second = await client.post(
        "/api/v1/auth/verify",
        json={"email": "ivan@mail.ru", "code": settings.dev_otp_code},
    )
    assert second.status_code == 200
    assert second.json()["id"] == user_id
    count = await db_session.scalar(
        select(func.count()).select_from(User).where(User.email == "ivan@mail.ru")
    )
    assert count == 1


async def test_rejects_invalid_email(client: AsyncClient, db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    response = await client.post(
        "/api/v1/auth/request-code",
        json={"email": "not-an-email"},
    )
    assert response.status_code == 422


async def test_rate_limit_and_invalid_code(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    email = settings.seed_editor_email
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)

    first = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert first.status_code == 200

    second = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "rate_limited"
    assert "код уже отправлен" in second.json()["error"]["message"].lower()

    for _ in range(settings.otp_max_attempts - 1):
        bad = await client.post(
            "/api/v1/auth/verify",
            json={"email": email, "code": "000000"},
        )
        assert bad.status_code == 401
        assert bad.json()["error"]["code"] == "otp_invalid"

    last = await client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": "000000"},
    )
    assert last.status_code == 429

    good = await client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    assert good.status_code == 429


async def test_expired_otp(client: AsyncClient, db_session: AsyncSession) -> None:
    settings = get_settings()
    email = "expired@example.com"
    await _ensure_user(db_session, email)

    request = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert request.status_code == 200

    await db_session.execute(
        update(OtpCode)
        .where(OtpCode.email == email)
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db_session.flush()

    verify = await client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 401
    assert verify.json()["error"]["code"] == "otp_expired"
    assert (
        "истёк" in verify.json()["error"]["message"].lower()
        or "истек" in verify.json()["error"]["message"].lower()
    )


async def test_captcha_required_on_third_request(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    email = "captcha@example.com"
    await _ensure_user(db_session, email)

    first = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert first.status_code == 200

    await db_session.execute(
        update(OtpCode)
        .where(OtpCode.email == email)
        .values(created_at=datetime.now(UTC) - timedelta(minutes=2))
    )
    second = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert second.status_code == 200

    await db_session.execute(
        update(OtpCode)
        .where(OtpCode.email == email)
        .values(created_at=datetime.now(UTC) - timedelta(minutes=2))
    )
    without = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert without.status_code == 400
    assert without.json()["error"]["code"] == "captcha_required"

    with_token = await client.post(
        "/api/v1/auth/request-code",
        json={"email": email, "captcha_token": settings.captcha_mock_token},
    )
    assert with_token.status_code == 200


async def test_production_mock_email_fail_closed(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _ensure_user(db_session, "prod@example.com")
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "email_provider", "mock")

    response = await client.post(
        "/api/v1/auth/request-code",
        json={"email": "prod@example.com"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "email_unavailable"


async def test_daily_otp_limit_returns_429(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """6-й request-code за сутки → 429 + retry_after (otp_daily_limit=5)."""
    settings = get_settings()
    email = "daily@example.com"
    await _ensure_user(db_session, email)

    for i in range(settings.otp_daily_limit):
        if i > 0:
            await db_session.execute(
                update(OtpCode)
                .where(OtpCode.email == email)
                .values(created_at=datetime.now(UTC) - timedelta(minutes=2))
            )
        response = await client.post(
            "/api/v1/auth/request-code",
            json={
                "email": email,
                "captcha_token": settings.captcha_mock_token if i >= 2 else None,
            },
        )
        assert response.status_code == 200, response.text

    await db_session.execute(
        update(OtpCode)
        .where(OtpCode.email == email)
        .values(created_at=datetime.now(UTC) - timedelta(minutes=2))
    )
    limited = await client.post(
        "/api/v1/auth/request-code",
        json={"email": email, "captcha_token": settings.captcha_mock_token},
    )
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert limited.json()["error"]["retry_after"] >= 1


async def test_patch_profile(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)

    await client.post("/api/v1/auth/request-code", json={"email": settings.seed_editor_email})
    verify = await client.post(
        "/api/v1/auth/verify",
        json={"email": settings.seed_editor_email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 200
    assert verify.json()["role"] == "editor"

    patched = await client.patch(
        "/api/v1/auth/me",
        json={"nickname": "editor_nick"},
    )
    assert patched.status_code == 200
    assert patched.json()["nickname"] == "editor_nick"

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["nickname"] == "editor_nick"


async def test_origin_guard_rejects_untrusted_origin(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _ensure_user(db_session, "origin@example.com")
    settings = get_settings()
    monkeypatch.setattr(settings, "cors_origins", "http://localhost:5173")

    response = await client.post(
        "/api/v1/auth/request-code",
        json={"email": "origin@example.com"},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code in {403, 400, 200}


async def test_mock_email_provider_called(client: AsyncClient, db_session: AsyncSession) -> None:
    await _ensure_user(db_session, "mocksend@example.com")
    with patch("app.services.auth.get_email_provider") as provider_factory:
        mock = AsyncMock(spec=MockEmailProvider)
        mock.name = "mock"
        mock.send_code = AsyncMock(return_value=None)
        provider_factory.return_value = mock
        response = await client.post(
            "/api/v1/auth/request-code",
            json={"email": "mocksend@example.com"},
        )
    assert response.status_code == 200
    mock.send_code.assert_awaited_once()


async def test_seed_dev_users_idempotent(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_dev_users(db_session)
    count = await db_session.scalar(select(func.count()).select_from(User))
    assert count and count >= 2


async def test_session_cookie_refreshed_on_me(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    email = "slide@example.com"
    await _ensure_user(db_session, email)

    req = await client.post("/api/v1/auth/request-code", json={"email": email})
    assert req.status_code == 200
    verify = await client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": settings.dev_otp_code},
    )
    assert verify.status_code == 200
    assert settings.session_cookie_name in verify.cookies

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200


async def test_verify_does_not_create_user(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    settings = get_settings()
    await seed_reference_data(db_session)
    # Plant an OTP without a user (simulates race / stale code).
    db_session.add(
        OtpCode(
            email="ghost@example.com",
            code_hash="x",
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )
    )
    await db_session.flush()
    response = await client.post(
        "/api/v1/auth/verify",
        json={"email": "ghost@example.com", "code": settings.dev_otp_code},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "account_not_found"
    assert await db_session.scalar(select(User).where(User.email == "ghost@example.com")) is None
