import smtplib

import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.email import smtp as smtp_module
from app.services.email.smtp import SMTP_TIMEOUT_SECONDS, SmtpEmailProvider


def _settings(port: int) -> Settings:
    return Settings(  # type: ignore[call-arg]
        _env_file=None,
        email_provider="smtp",
        smtp_host="smtp.example.com",
        smtp_port=port,
        smtp_user="user@example.com",
        smtp_password="secret",
        smtp_from="noreply@example.com",
    )


async def test_unreachable_smtp_fails_fast_with_503(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def refuse(host: str, port: int, **kwargs: object) -> None:
        seen.update(host=host, port=port, timeout=kwargs.get("timeout"))
        raise TimeoutError("timed out")

    monkeypatch.setattr(smtp_module.smtplib, "SMTP_SSL", refuse)
    provider = SmtpEmailProvider(_settings(465))
    with pytest.raises(AppError) as error:
        await provider.send_code("player@example.com", "123456")
    assert error.value.status_code == 503
    assert error.value.code == "email_unavailable"
    assert seen == {"host": "smtp.example.com", "port": 465, "timeout": SMTP_TIMEOUT_SECONDS}


async def test_smtp_auth_error_is_reported_as_503(monkeypatch: pytest.MonkeyPatch) -> None:
    class RejectingSmtp:
        def __init__(self, *args: object, **kwargs: object) -> None:
            assert kwargs.get("timeout") == SMTP_TIMEOUT_SECONDS

        def __enter__(self) -> "RejectingSmtp":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def starttls(self, **kwargs: object) -> None:
            return None

        def login(self, user: str, password: str) -> None:
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")

    monkeypatch.setattr(smtp_module.smtplib, "SMTP", RejectingSmtp)
    provider = SmtpEmailProvider(_settings(587))
    with pytest.raises(AppError) as error:
        await provider.send_code("player@example.com", "123456")
    assert error.value.status_code == 503
