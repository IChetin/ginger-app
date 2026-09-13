import pytest

from app.core.config import Settings
from app.services.captcha import CaptchaUnavailableError, verify_captcha_token

SAFE = {
    "app_env": "production",
    "otp_hmac_secret": "a" * 64,
    "session_cookie_secure": True,
    "cors_origins": "https://lisa52.com",
    "frontend_base_url": "https://lisa52.com",
    "database_url": "postgresql+asyncpg://ginger:0123456789abcdef@postgres:5432/ginger",
}


def test_dev_defaults_are_rejected_for_production() -> None:
    problems = Settings(app_env="production", _env_file=None).production_problems()  # type: ignore[call-arg]
    text = "; ".join(problems)
    for expected in (
        "OTP_HMAC_SECRET",
        "SESSION_COOKIE_SECURE",
        "CORS_ORIGINS",
        "FRONTEND_BASE_URL",
        "DATABASE_URL",
    ):
        assert expected in text


def test_filled_production_settings_pass() -> None:
    assert Settings(**SAFE, _env_file=None).production_problems() == []  # type: ignore[arg-type]


async def test_mock_captcha_token_does_not_pass_in_production() -> None:
    settings = Settings(**SAFE, captcha_provider="mock", _env_file=None)  # type: ignore[arg-type]
    with pytest.raises(CaptchaUnavailableError):
        await verify_captcha_token("ok", client_ip="1.2.3.4", required=True, settings=settings)


async def test_mock_captcha_still_works_in_development() -> None:
    settings = Settings(app_env="development", captcha_provider="mock", _env_file=None)  # type: ignore[call-arg]
    await verify_captcha_token("ok", client_ip="1.2.3.4", required=True, settings=settings)
