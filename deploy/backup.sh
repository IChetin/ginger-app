#!/usr/bin/env bash
# Бэкап базы и вложений на сервере. Ставится в cron пользователя ginger:
#
#   15 3 * * * bash /opt/ginger/app/deploy/backup.sh >> /opt/ginger/backups/backup.log 2>&1
#
# Хранит 14 дней локально и 30 дней на Google Drive (решение Ивана 15.09). Восстановление
# с Drive проверяет backup-verify.sh раз в неделю.
set -euo pipefail

# shellcheck source=lib-rclone.sh
source "$(dirname "$0")/lib-rclone.sh"

APP_DIR="/opt/ginger/app"
BACKUP_DIR="/opt/ginger/backups"
KEEP_DAYS=14
REMOTE_KEEP_DAYS=30
STAMP="$(date -u +%Y%m%d-%H%M)"

cd "$APP_DIR"
umask 077

docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  >"$BACKUP_DIR/db-$STAMP.dump"

# Скриншоты оплат и картинки тредов лежат в томе uploads.
docker run --rm -v ginger_uploads:/data:ro -v "$BACKUP_DIR":/backup alpine \
  tar -czf "/backup/uploads-$STAMP.tgz" -C /data .

find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup $STAMP ok: $(du -sh "$BACKUP_DIR" | cut -f1) total"

# Копия за пределы сервера. Без токена Google Drive шаг пропускается, локальный бэкап уже есть.
if ! rclone_ready; then
  echo "$(date -u +%FT%TZ) offsite $STAMP skipped: нет токена Google Drive"
  exit 0
fi
if ! rclone copy "$BACKUP_DIR" "$REMOTE"   --include "db-$STAMP.dump" --include "uploads-$STAMP.tgz" --quiet; then
  echo "$(date -u +%FT%TZ) offsite $STAMP FAILED: не удалось скопировать на Google Drive"
  exit 1
fi
rclone delete "$REMOTE" --min-age "${REMOTE_KEEP_DAYS}d" --quiet
echo "$(date -u +%FT%TZ) offsite $STAMP ok: Google Drive, храним $REMOTE_KEEP_DAYS дней"
