#!/usr/bin/env bash
# Раз в неделю: восстановить свежий дамп с Google Drive во временный Postgres и убедиться,
# что база читается (ТЗ: бэкапы наружу с еженедельной проверкой восстановления). Cron ginger:
#
#   45 4 * * 1 bash /opt/ginger/app/deploy/backup-verify.sh >> /opt/ginger/backups/backup.log 2>&1
set -euo pipefail

# shellcheck source=lib-rclone.sh
source "$(dirname "$0")/lib-rclone.sh"

CONTAINER="ginger-restore-check"
WORK="$(mktemp -d)"
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

log() { echo "$(date -u +%FT%TZ) verify $*"; }

if ! rclone_ready; then
  log "skipped: нет токена Google Drive"
  exit 0
fi

LATEST="$(rclone lsf "$REMOTE" --include 'db-*.dump' | sort | tail -1)"
if [[ -z "$LATEST" ]]; then
  log "FAILED: на Google Drive нет дампов базы"
  exit 1
fi
rclone copyto "$REMOTE/$LATEST" "$WORK/$LATEST" --quiet

docker run -d --rm --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=restore-check -e POSTGRES_DB=restore postgres:16-alpine >/dev/null

# Образ сначала поднимает временный сервер для инициализации и перезапускается —
# ждём, пока база ответит два раза подряд с паузой.
wait_ready() {
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres -d restore >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}
wait_ready && sleep 5 && wait_ready

docker exec -i "$CONTAINER" pg_restore -U postgres -d restore --no-owner --no-acl <"$WORK/$LATEST"

query() { docker exec "$CONTAINER" psql -U postgres -d restore -tAc "$1"; }
TABLES="$(query "select count(*) from information_schema.tables where table_schema = 'public'")"
USERS="$(query "select count(*) from users")"
if [[ "$TABLES" -lt 10 ]]; then
  log "FAILED: $LATEST — в восстановленной базе всего $TABLES таблиц"
  exit 1
fi
log "$LATEST ok: таблиц $TABLES, пользователей $USERS"
