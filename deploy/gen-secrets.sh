#!/usr/bin/env bash
# Создать .env боевого стенда на сервере. Запускать в /opt/ginger/app ОДИН раз.
#
# Секреты генерируются здесь же и никуда не печатаются. Повторный запуск не трогает
# существующий .env — чтобы случайно не сменить пароль базы с живыми данными.
#
#   bash deploy/gen-secrets.sh lisa52.com admin@lisa52.com
#
# Второй аргумент — email администратора (SUPERADMIN_EMAILS).
set -euo pipefail

DOMAIN="${1:?Укажите домен: bash deploy/gen-secrets.sh lisa52.com you@example.com}"
ADMIN_EMAIL="${2:?Укажите email администратора вторым аргументом}"
ENV_FILE=".env"

if [ -e "$ENV_FILE" ]; then
  echo "$ENV_FILE уже есть — не трогаю. Удалите его вручную, только если база ещё пустая." >&2
  exit 1
fi

secret() { openssl rand -hex 32; }
DB_PASSWORD="$(secret)"

umask 077
cat >"$ENV_FILE" <<EOF
# Боевые настройки Ginger APP. Файл не коммитится (см. .gitignore).
APP_ENV=production
APP_NAME=Ginger
DOMAIN=${DOMAIN}
FRONTEND_BASE_URL=https://${DOMAIN}
CORS_ORIGINS=https://${DOMAIN}
SEED_DEMO_DATA=false
SUPERADMIN_EMAILS=${ADMIN_EMAIL}

# База
POSTGRES_USER=ginger
POSTGRES_DB=ginger
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql+asyncpg://ginger:${DB_PASSWORD}@postgres:5432/ginger

# Сессии и подписи
OTP_HMAC_SECRET=$(secret)
PREVIEW_HMAC_SECRET=$(secret)
SESSION_COOKIE_NAME=ginger_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax

# Почта: Yandex Cloud Postbox (Brevo, SMTP2GO и ZeptoMail не регистрируют из РФ).
# SMTP_USER — ID API-ключа сервисного аккаунта (scope yc.postbox.send), SMTP_PASSWORD — его
# секрет. Вписывает владелец облака, в чат не пересылает.
EMAIL_PROVIDER=smtp
SMTP_HOST=postbox.cloud.yandex.net
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USE_SSL=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@${DOMAIN}
SMTP_FROM_NAME=Ginger

# Капчи нет: заглушка в production отказывает, поэтому порог повышен —
# живой человек редко просит код больше четырёх раз в сутки.
CAPTCHA_PROVIDER=mock
OTP_CAPTCHA_AFTER_COUNT=4

IMPORT_AI_PROVIDER=unconfigured
VAPID_SUBJECT=mailto:postmaster@${DOMAIN}
EOF

echo "Секреты базы и подписей записаны в $ENV_FILE."

# VAPID-ключи пушей генерирует py_vapid из образа воркера.
docker compose -f docker-compose.prod.yml build worker >/dev/null
docker compose -f docker-compose.prod.yml run --rm --no-deps -T worker python - >>"$ENV_FILE" <<'PY'
import base64

from py_vapid import Vapid01

vapid = Vapid01()
vapid.generate_keys()
numbers = vapid.public_key.public_numbers()
raw = b"\x04" + numbers.x.to_bytes(32, "big") + numbers.y.to_bytes(32, "big")
private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
print("VAPID_PUBLIC_KEY=" + base64.urlsafe_b64encode(raw).rstrip(b"=").decode())
print("VAPID_PRIVATE_KEY=" + base64.urlsafe_b64encode(private).rstrip(b"=").decode())
PY

echo "VAPID-ключи добавлены. Осталось вписать SMTP_USER и SMTP_PASSWORD от Brevo."
