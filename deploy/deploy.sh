#!/usr/bin/env bash
# Выкатить текущий коммит на боевой сервер. Запускать локально из корня репозитория (Git Bash):
#
#   bash deploy/deploy.sh                 # обычный деплой
#   bash deploy/deploy.sh --force-update  # старые клиенты перезагрузятся (минимальная сборка)
#
# Код едет из HEAD (git archive) — поэтому незакоммиченные правки не выкатываются, а фронт
# собирается из того же дерева: при грязном дереве скрипт останавливается. Фронт собирается
# в dev-контейнере локально: на сервере 2 ГБ памяти, сборка Vite туда не влезает.
set -euo pipefail

FORCE_UPDATE=0
for arg in "$@"; do
  if [ "$arg" = "--force-update" ]; then FORCE_UPDATE=1; fi
done

HOST="${GINGER_HOST:-ginger}" # алиас из ~/.ssh/config
DOMAIN="${GINGER_DOMAIN:-lisa52.com}"
APP_DIR="/opt/ginger/app"

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незакоммиченные изменения — сначала коммит." >&2
  exit 1
fi
REVISION="$(git rev-parse --short HEAD)"
# Номер сборки фронта: клиент шлёт его в X-Client-Build, сервер сравнивает с минимальным.
BUILD_ID="$(date -u +%Y%m%d%H%M%S)"

echo "==> Сборка фронта ($REVISION)"
docker compose exec -T -e VITE_APP_BUILD="$BUILD_ID" frontend npm run build

echo "==> Код на сервер"
git archive --format=tar HEAD | ssh "$HOST" "set -e; cd $APP_DIR; \
  find . -mindepth 1 -maxdepth 1 ! -name .env ! -name frontend-dist -exec rm -rf {} +; \
  tar -x; echo $REVISION > REVISION"

echo "==> Фронт на сервер"
# Каталог подменяется содержимым, а не переименованием: Caddy смонтировал именно его.
tar -C frontend/dist -cf - . | ssh "$HOST" "set -e; cd $APP_DIR; \
  rm -rf frontend-dist.new && mkdir -p frontend-dist.new frontend-dist; \
  tar -x -C frontend-dist.new; \
  find frontend-dist -mindepth 1 -delete; cp -a frontend-dist.new/. frontend-dist/; \
  rm -rf frontend-dist.new"

if [ "$FORCE_UPDATE" = 1 ]; then
  echo "==> Минимальная сборка клиента: $BUILD_ID"
  ssh "$HOST" "cd $APP_DIR && { grep -v '^MIN_CLIENT_BUILD=' .env; echo MIN_CLIENT_BUILD=$BUILD_ID; } > .env.new \
    && cat .env.new > .env && rm .env.new"
fi

echo "==> Перезапуск контейнеров"
ssh "$HOST" "cd $APP_DIR && docker compose -f docker-compose.prod.yml up -d --build --remove-orphans \
  && docker image prune -f >/dev/null"

echo "==> Проверка"
for _ in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/api/v1/health" >/dev/null 2>&1; then
    echo "OK: https://${DOMAIN} — $REVISION"
    exit 0
  fi
  sleep 5
done
echo "Сервис не ответил за 150 секунд: ssh $HOST 'cd $APP_DIR && docker compose -f docker-compose.prod.yml logs --tail=80'" >&2
exit 1
