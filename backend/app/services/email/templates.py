# ruff: noqa: E501 — HTML писем нельзя переносить без поломки вёрстки
"""Письма входа в фирменном стиле Ginger.

Вёрстка под почтовые клиенты: таблицы и инлайн-стили (Gmail вырезает <style> и не знает
flex/grid), ширина до 480 px, светлая палитра приложения. Логотип грузится с сайта —
`FRONTEND_BASE_URL/icons/ginger-mark-96.png`; если клиент картинки не показывает, остаётся
текстовое «Ginger». Скрытый прехедер задаёт строку превью в списке писем.
"""

from html import escape

from app.core.config import Settings

BG = "#f4eee2"
CARD = "#fcf8ef"
LINE = "#e7dcc5"
TEXT = "#2a2209"
TEXT_2 = "#6e6449"
TEXT_3 = "#9c9173"
GOLD = "#8a6a2b"
GOLD_SOFT = "#f0e8d7"
GOLD_BUTTON = "#d3a94f"
GOLD_GRAD = "linear-gradient(180deg, #e9c877 0%, #c89a3f 100%)"
TEXT_ON_GOLD = "#241a04"
FONT = "'Manrope', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


def _layout(*, settings: Settings, preheader: str, title: str, body: str, footnote: str) -> str:
    app_name = escape(settings.app_name)
    site = settings.frontend_base_url.rstrip("/")
    logo = f"{site}/icons/ginger-mark-96.png"
    host = escape(site.split("://", 1)[-1])
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{BG};">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td style="padding:0 4px 18px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="{escape(logo)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:20px;">
                </td>
                <td style="vertical-align:middle;padding-left:10px;font-family:{FONT};font-size:22px;font-weight:800;color:{TEXT};letter-spacing:-0.02em;">
                  {app_name}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:{CARD};border:1px solid {LINE};border-radius:16px;padding:28px 24px;font-family:{FONT};color:{TEXT};">
            <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:{TEXT};">{escape(title)}</h1>
            {body}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 8px 0 8px;font-family:{FONT};font-size:12px;line-height:1.5;color:{TEXT_3};text-align:center;">
            {footnote}<br>
            <a href="{escape(site)}" style="color:{TEXT_3};text-decoration:underline;">{host}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def _paragraph(text: str) -> str:
    return f'<p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:{TEXT_2};">{text}</p>'


def _button(*, url: str, label: str) -> str:
    safe_url = escape(url)
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
              <tr>
                <td align="center" bgcolor="{GOLD_BUTTON}" style="border-radius:12px;background:{GOLD_BUTTON};background-image:{GOLD_GRAD};">
                  <a href="{safe_url}" style="display:block;padding:15px 20px;font-family:{FONT};font-size:16px;font-weight:800;color:{TEXT_ON_GOLD};text-decoration:none;border-radius:12px;">{escape(label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;line-height:1.5;color:{TEXT_3};">Если кнопка не нажимается, откройте ссылку:<br>
              <a href="{safe_url}" style="color:{GOLD};word-break:break-all;">{safe_url}</a>
            </p>"""


def build_otp_email(*, code: str, settings: Settings) -> tuple[str, str, str]:
    subject = f"{settings.app_name} — код для входа"
    plain = (
        f"Ваш код для входа в {settings.app_name}: {code}\n\n"
        "Код действует 5 минут. Никому его не сообщайте — менеджеры клуба код не спрашивают.\n\n"
        "Если вы не запрашивали вход, просто проигнорируйте письмо.\n\n"
        f"— {settings.app_name}"
    )
    body = (
        _paragraph("Введите этот код в приложении, чтобы войти:")
        + f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px 0;">
              <tr>
                <td align="center" style="background:{GOLD_SOFT};border:1px solid {LINE};border-radius:12px;padding:18px 8px;font-family:{FONT};font-size:36px;line-height:1;font-weight:800;letter-spacing:0.28em;color:{TEXT};">{escape(code)}</td>
              </tr>
            </table>"""
        + _paragraph(
            'Код действует <b style="color:' + TEXT + ';">5 минут</b>. '
            "Никому его не сообщайте — менеджеры клуба код не спрашивают."
        )
    )
    html = _layout(
        settings=settings,
        preheader=f"Код {code} — действует 5 минут",
        title="Код для входа",
        body=body,
        footnote="Если вы не запрашивали вход, просто проигнорируйте письмо.",
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
        _paragraph("Остался один шаг — подтвердите, что это ваш адрес.")
        + _button(url=url, label="Подтвердить email")
        + '<p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:'
        + TEXT_2
        + ';">Ссылка действует 24 часа.</p>'
    )
    html = _layout(
        settings=settings,
        preheader="Подтвердите email — ссылка действует 24 часа",
        title="Подтвердите email",
        body=body,
        footnote="Если вы не регистрировались, просто проигнорируйте письмо.",
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
        _paragraph("Кто-то запросил сброс пароля для вашего аккаунта. Если это вы — задайте новый.")
        + _button(url=url, label="Задать новый пароль")
        + '<p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:'
        + TEXT_2
        + ';">Ссылка действует 1 час.</p>'
    )
    html = _layout(
        settings=settings,
        preheader="Сброс пароля — ссылка действует 1 час",
        title="Сброс пароля",
        body=body,
        footnote="Если вы не запрашивали сброс, просто проигнорируйте письмо — пароль не изменится.",
    )
    return subject, plain, html
