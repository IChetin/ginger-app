from app.core.config import Settings


def build_otp_email(*, code: str, settings: Settings) -> tuple[str, str, str]:
    subject = f"{settings.app_name} — код для входа"
    plain = (
        f"Ваш код для входа в {settings.app_name}: {code}\n\n"
        "Код действует 5 минут.\n\n"
        f"— {settings.app_name}"
    )
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; color: #111; line-height: 1.5;">
  <p>Ваш код для входа в {settings.app_name}:</p>
  <p style="font-size: 32px; font-weight: 800; letter-spacing: 0.2em; margin: 16px 0;">{code}</p>
  <p>Код действует 5 минут.</p>
  <p style="color: #666;">— {settings.app_name}</p>
</body>
</html>"""
    return subject, plain, html


def build_verification_email(*, url: str, settings: Settings) -> tuple[str, str, str]:
    subject = f"{settings.app_name} — подтвердите email"
    plain = (
        f"Подтвердите email для {settings.app_name}:\n\n"
        f"{url}\n\n"
        "Ссылка действует 24 часа. Если вы не регистрировались — просто игнорируйте письмо.\n\n"
        f"— {settings.app_name}"
    )
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; color: #111; line-height: 1.5;">
  <p>Подтвердите email для {settings.app_name}:</p>
  <p><a href="{url}" style="font-weight: 700;">{url}</a></p>
  <p>Ссылка действует 24 часа.</p>
  <p style="color: #666;">Если вы не регистрировались — просто игнорируйте письмо.</p>
  <p style="color: #666;">— {settings.app_name}</p>
</body>
</html>"""
    return subject, plain, html


def build_password_reset_email(*, url: str, settings: Settings) -> tuple[str, str, str]:
    subject = f"{settings.app_name} — сброс пароля"
    plain = (
        f"Сброс пароля для {settings.app_name}:\n\n"
        f"{url}\n\n"
        "Ссылка действует 1 час. Если вы не запрашивали сброс — игнорируйте письмо.\n\n"
        f"— {settings.app_name}"
    )
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; color: #111; line-height: 1.5;">
  <p>Сброс пароля для {settings.app_name}:</p>
  <p><a href="{url}" style="font-weight: 700;">{url}</a></p>
  <p>Ссылка действует 1 час.</p>
  <p style="color: #666;">Если вы не запрашивали сброс — игнорируйте письмо.</p>
  <p style="color: #666;">— {settings.app_name}</p>
</body>
</html>"""
    return subject, plain, html
