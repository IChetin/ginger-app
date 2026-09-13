from __future__ import annotations

import logging

import httpx

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, CaptchaRequiredError

logger = logging.getLogger(__name__)

YANDEX_VALIDATE_URL = "https://smartcaptcha.cloud.yandex.ru/validate"


class CaptchaInvalidError(AppError):
    def __init__(self, message: str = "Captcha validation failed") -> None:
        super().__init__(code="captcha_invalid", message=message, status_code=400)


class CaptchaUnavailableError(AppError):
    def __init__(self, message: str = "Captcha service unavailable") -> None:
        super().__init__(code="captcha_unavailable", message=message, status_code=503)


async def verify_captcha_token(
    token: str | None,
    *,
    client_ip: str,
    required: bool,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    if not required:
        return
    if not token:
        raise CaptchaRequiredError()

    provider = settings.captcha_provider.strip().lower()
    if provider == "mock":
        # Токен заглушки лежит в репозитории: на боевом сервере он капчу не проходит.
        if settings.is_production:
            raise CaptchaUnavailableError("Captcha is not configured")
        if token == settings.captcha_mock_token:
            return
        raise CaptchaInvalidError()

    if provider != "yandex":
        raise CaptchaUnavailableError("Unsupported captcha provider")

    if not settings.smartcaptcha_server_key:
        if settings.is_production:
            raise CaptchaUnavailableError("SmartCaptcha server key is not configured")
        # Non-production without key: accept mock token only.
        if token == settings.captcha_mock_token:
            return
        raise CaptchaUnavailableError("SmartCaptcha server key is not configured")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                YANDEX_VALIDATE_URL,
                data={
                    "secret": settings.smartcaptcha_server_key,
                    "token": token,
                    "ip": client_ip,
                },
            )
    except httpx.HTTPError:
        logger.exception("smartcaptcha validate request failed")
        if settings.is_production:
            raise CaptchaUnavailableError() from None
        # Fail-open only outside production when network is broken.
        return

    if response.status_code >= 500:
        logger.error("smartcaptcha validate HTTP %s", response.status_code)
        if settings.is_production:
            raise CaptchaUnavailableError()
        return

    try:
        payload = response.json()
    except ValueError as exc:
        raise CaptchaUnavailableError() from exc

    if payload.get("status") != "ok":
        raise CaptchaInvalidError()
