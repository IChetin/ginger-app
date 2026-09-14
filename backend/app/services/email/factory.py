from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.services.email.base import EmailProvider, EmailSendResult
from app.services.email.mock import MockEmailProvider
from app.services.email.postbox import PostboxEmailProvider
from app.services.email.smtp import SmtpEmailProvider


class UnconfiguredEmailProvider:
    """Fail-closed provider used when production email is not configured."""

    name = "unconfigured"

    async def send_code(self, email: str, code: str) -> EmailSendResult:
        _ = email, code
        raise AppError(
            code="email_unavailable",
            message="Email provider is not configured",
            status_code=503,
        )

    async def send_verification_link(self, email: str, url: str) -> EmailSendResult:
        _ = email, url
        raise AppError(
            code="email_unavailable",
            message="Email provider is not configured",
            status_code=503,
        )

    async def send_password_reset_link(self, email: str, url: str) -> EmailSendResult:
        _ = email, url
        raise AppError(
            code="email_unavailable",
            message="Email provider is not configured",
            status_code=503,
        )


def get_email_provider(settings: Settings | None = None) -> EmailProvider:
    settings = settings or get_settings()
    provider = settings.email_provider.strip().lower()

    if provider == "mock":
        if settings.is_production:
            return UnconfiguredEmailProvider()
        return MockEmailProvider()

    if provider == "postbox":
        if not (
            settings.postbox_access_key_id
            and settings.postbox_secret_access_key
            and settings.smtp_from
        ):
            return UnconfiguredEmailProvider()
        return PostboxEmailProvider(settings)

    if provider == "smtp":
        if not settings.smtp_host or not settings.smtp_from:
            return UnconfiguredEmailProvider()
        return SmtpEmailProvider(settings)

    return UnconfiguredEmailProvider()
