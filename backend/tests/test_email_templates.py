from datetime import UTC, datetime

from app.core.config import Settings
from app.services.email.templates import (
    build_otp_email,
    build_password_reset_email,
    build_verification_email,
)


def _settings() -> Settings:
    return Settings(  # type: ignore[call-arg]
        _env_file=None,
        app_name="Ginger",
        frontend_base_url="https://lisa52.com",
    )


def test_otp_email_shows_code_in_preview_body_and_plain_text() -> None:
    requested_at = datetime(2026, 9, 14, 10, 42, tzinfo=UTC)
    subject, plain, html = build_otp_email(
        code="788425", settings=_settings(), requested_at=requested_at
    )

    assert subject == "Ginger — код для входа"
    assert "788425" in plain
    assert "Код 788425 — действует 5 минут" in html  # строка превью в списке писем
    assert ">788425</td>" in html  # код одной строкой — работает «Скопировать код»
    assert 'src="https://lisa52.com/brand/email-header.png"' in html
    assert 'alt="Ginger"' in html
    assert "запрошен 14 сентября в 13:42 по Москве" in html
    assert "Запрошен 14 сентября в 13:42 по Москве" in plain


def test_link_emails_escape_url_and_render_button() -> None:
    url = 'https://lisa52.com/reset?token=a&b="x"'
    for build, label in (
        (build_verification_email, "Подтвердить email"),
        (build_password_reset_email, "Задать новый пароль"),
    ):
        _, plain, html = build(url=url, settings=_settings())
        assert url in plain
        assert 'href="https://lisa52.com/reset?token=a&amp;b=&quot;x&quot;"' in html
        assert url not in html
        assert label in html
