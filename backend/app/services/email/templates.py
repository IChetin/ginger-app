# ruff: noqa: E501 — HTML писем нельзя переносить без поломки вёрстки
"""Письма входа в фирменном стиле Ginger.

Тёмная тема приложения: баннер с логотипом «GINGER», карточка, золотые акценты. Вёрстка под
почтовые клиенты — таблицы и инлайн-стили (Gmail вырезает <style> и не знает flex/grid),
ширина до 520 px. Баннер — картинка с сайта (`/brand/email-header.png`): SVG и веб-шрифты
почтовики не показывают; без картинок остаются тёмный фон и alt «Ginger». Код — одной
строкой текста, чтобы Gmail и iOS предлагали «Скопировать код». Скрытый прехедер задаёт
строку превью в списке писем.
"""

from datetime import UTC, datetime, timedelta, timezone
from html import escape

from app.core.config import Settings

BG = "#0b0a09"
CARD = "#141311"
CARD_2 = "#1c1a16"
LINE = "#2a2620"
LINE_GOLD = "#4a3d22"
TEXT = "#f5f2ea"
TEXT_2 = "#a9a395"
TEXT_3 = "#77705f"
GOLD = "#d9b36a"
GOLD_HI = "#f1d68e"
GOLD_BUTTON = "#d3a94f"
GOLD_GRAD = "linear-gradient(180deg, #f1d68e 0%, #d3a94f 100%)"
TEXT_ON_GOLD = "#1c1503"
FONT = "'Golos Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
DISPLAY_FONT = "'Tektur', 'Golos Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

MOSCOW = timezone(timedelta(hours=3))
MONTHS = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)


def _moscow_time(moment: datetime) -> str:
    local = moment.astimezone(MOSCOW)
    return f"{local.day} {MONTHS[local.month - 1]} в {local:%H:%M} по Москве"


def _layout(*, settings: Settings, preheader: str, eyebrow: str, title: str, body: str) -> str:
    app_name = escape(settings.app_name)
    site = settings.frontend_base_url.rstrip("/")
    banner = f"{site}/brand/email-header.png"
    host = escape(site.split("://", 1)[-1])
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:{BG};" bgcolor="{BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{BG};">{escape(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BG}" style="background:{BG};">
  <tr>
    <td align="center" style="padding:28px 12px 36px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td bgcolor="{BG}" style="background:{BG};border:1px solid {LINE};border-bottom:0;border-radius:20px 20px 0 0;padding:0;line-height:0;">
            <img src="{escape(banner)}" width="520" alt="{app_name}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:20px 20px 0 0;color:{GOLD};font-family:{DISPLAY_FONT};font-size:24px;font-weight:700;line-height:1.2;">
          </td>
        </tr>
        <tr>
          <td bgcolor="{CARD}" style="background:{CARD};border:1px solid {LINE};border-top:0;border-radius:0 0 20px 20px;padding:30px 28px 30px 28px;font-family:{FONT};color:{TEXT};">
            <p style="margin:0 0 10px 0;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:{GOLD};">{escape(eyebrow)}</p>
            <h1 style="margin:0 0 12px 0;font-family:{DISPLAY_FONT};font-size:24px;line-height:1.2;font-weight:700;letter-spacing:0.005em;color:{TEXT};">{escape(title)}</h1>
            {body}
          </td>
        </tr>
        <tr>
          <td style="padding:22px 16px 0 16px;font-family:{FONT};font-size:12px;line-height:1.6;color:{TEXT_3};text-align:center;">
            Письмо отправлено автоматически — отвечать на него не нужно.<br>
            <a href="{escape(site)}" style="color:{TEXT_2};text-decoration:none;">{app_name} · {host}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def _paragraph(text: str, *, margin: str = "0 0 18px 0") -> str:
    return f'<p style="margin:{margin};font-size:15px;line-height:1.55;color:{TEXT_2};">{text}</p>'


def _notice(title: str, text: str) -> str:
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;border-top:1px solid {LINE};">
              <tr>
                <td style="padding:18px 0 0 0;font-family:{FONT};">
                  <p style="margin:0 0 4px 0;font-size:14px;line-height:1.45;font-weight:600;color:{TEXT};">{escape(title)}</p>
                  <p style="margin:0;font-size:13px;line-height:1.55;color:{TEXT_2};">{escape(text)}</p>
                </td>
              </tr>
            </table>"""


def _button(*, url: str, label: str) -> str:
    safe_url = escape(url)
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px 0;">
              <tr>
                <td align="center" bgcolor="{GOLD_BUTTON}" style="border-radius:14px;background:{GOLD_BUTTON};background-image:{GOLD_GRAD};">
                  <a href="{safe_url}" style="display:block;padding:16px 20px;font-family:{FONT};font-size:16px;font-weight:700;color:{TEXT_ON_GOLD};text-decoration:none;border-radius:14px;">{escape(label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;line-height:1.55;color:{TEXT_3};">Если кнопка не нажимается, откройте ссылку:<br>
              <a href="{safe_url}" style="color:{GOLD};word-break:break-all;">{safe_url}</a>
            </p>"""


def build_otp_email(
    *, code: str, settings: Settings, requested_at: datetime | None = None
) -> tuple[str, str, str]:
    when = _moscow_time(requested_at or datetime.now(UTC))
    subject = f"{settings.app_name} — код для входа"
    plain = (
        f"Ваш код для входа в {settings.app_name}: {code}\n\n"
        f"Действует 5 минут. Запрошен {when}.\n\n"
        "Никому не сообщайте код — менеджеры клуба его не спрашивают. "
        "Если вход запрашивали не вы, просто проигнорируйте письмо: без кода в аккаунт не попасть.\n\n"
        f"— {settings.app_name}"
    )
    body = (
        _paragraph("Введите его на экране входа — и вы в игре.")
        + f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
              <tr>
                <td align="center" bgcolor="{CARD_2}" style="background:{CARD_2};border:1px solid {LINE_GOLD};border-radius:16px;padding:22px 8px 22px 20px;font-family:{DISPLAY_FONT};font-size:40px;line-height:1;font-weight:700;letter-spacing:0.3em;color:{GOLD_HI};">{escape(code)}</td>
              </tr>
            </table>"""
        + f'<p style="margin:0;font-size:13px;line-height:1.55;color:{TEXT_3};text-align:center;">Действует <span style="color:{TEXT_2};font-weight:600;">5 минут</span> · запрошен {escape(when)}</p>'
        + _notice(
            "Никому не сообщайте код",
            "Менеджеры клуба его не спрашивают. Если вход запрашивали не вы — просто проигнорируйте письмо: без кода в аккаунт не попасть.",
        )
    )
    html = _layout(
        settings=settings,
        preheader=f"Код {code} — действует 5 минут",
        eyebrow="Вход в Ginger",
        title="Ваш код для входа",
        body=body,
    )
    return subject, plain, html


def build_verification_email(*, url: str, settings: Settings) -> tuple[str, str, str]:
    subject = f"{settings.app_name} — подтвердите email"
    plain = (
        f"Подтвердите email для {settings.app_name}:\n\n"
        f"{url}\n\n"
        "Ссылка действует 24 часа. Если вы не регистрировались — просто игнорируйте письмо.\n\n"
        f"— {settings.app_name}"
    )
    body = (
        _paragraph("Остался один шаг — подтвердите, что это ваш адрес. Ссылка действует 24 часа.")
        + _button(url=url, label="Подтвердить email")
        + _notice(
            "Не регистрировались?",
            "Просто проигнорируйте письмо — без подтверждения аккаунт не заработает.",
        )
    )
    html = _layout(
        settings=settings,
        preheader="Подтвердите email — ссылка действует 24 часа",
        eyebrow="Регистрация",
        title="Подтвердите email",
        body=body,
    )
    return subject, plain, html


def build_password_reset_email(*, url: str, settings: Settings) -> tuple[str, str, str]:
    subject = f"{settings.app_name} — сброс пароля"
    plain = (
        f"Сброс пароля для {settings.app_name}:\n\n"
        f"{url}\n\n"
        "Ссылка действует 1 час. Если вы не запрашивали сброс — игнорируйте письмо.\n\n"
        f"— {settings.app_name}"
    )
    body = (
        _paragraph(
            "Кто-то запросил сброс пароля для вашего аккаунта. Если это вы — задайте новый. Ссылка действует 1 час."
        )
        + _button(url=url, label="Задать новый пароль")
        + _notice(
            "Не запрашивали сброс?",
            "Просто проигнорируйте письмо — пароль останется прежним.",
        )
    )
    html = _layout(
        settings=settings,
        preheader="Сброс пароля — ссылка действует 1 час",
        eyebrow="Безопасность",
        title="Сброс пароля",
        body=body,
    )
    return subject, plain, html
