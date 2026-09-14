#!/usr/bin/env bash
# Записать секрет в .env боевого стенда из стандартного ввода и перезапустить бэкенд и воркер.
#
# Значение не печатается и не попадает в историю команд. Запускать с компьютера владельца,
# скопировав секрет в буфер обмена. Команда без кавычек — PowerShell 5.1 ломает кавычки
# при передаче аргументов в ssh:
#
#   (Get-Clipboard -Raw).Trim() | ssh ginger bash /opt/ginger/app/deploy/set-env-secret.sh SMTP_PASSWORD
set -euo pipefail

KEY="${1:?Укажите имя переменной, например SMTP_PASSWORD}"
ENV_FILE="/opt/ginger/app/.env"

IFS= read -r VALUE || true
VALUE="${VALUE%$'\r'}"
if [ -z "$VALUE" ]; then
  echo "Пустое значение — ничего не записано. Скопируйте секрет в буфер обмена." >&2
  exit 1
fi
if ! grep -q "^${KEY}=" "$ENV_FILE"; then
  echo "В .env нет строки ${KEY}= — ничего не записано." >&2
  exit 1
fi

LENGTH=${#VALUE}
TMP="$(mktemp)"
chmod 600 "$TMP"
# awk с ENVIRON, а не sed: значение может содержать символы, которые sed понял бы как команду.
K="$KEY" V="$VALUE" awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"] }
  index($0, k "=") == 1 { print k "=" v; next }
  { print }' "$ENV_FILE" >"$TMP"
cat "$TMP" >"$ENV_FILE"
rm -f "$TMP"
unset VALUE

cd /opt/ginger/app
docker compose -f docker-compose.prod.yml up -d --force-recreate backend worker >/dev/null 2>&1
echo "SAVED ${KEY}: ${LENGTH} символов, бэкенд перезапущен"
