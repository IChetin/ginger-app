#!/usr/bin/env bash
# Выкатить текущий коммит на боевой сервер. Запускать локально из корня репозитория (Git Bash):
#
#   bash deploy/deploy.sh                 # обычный деплой
#   bash deploy/deploy.sh --force-update  # старые клиенты перезагрузятся (минимальная сборка)
#   bash deploy/deploy.sh --caddy-only    # только Caddyfile из HEAD, остальной код не трогать
#
# Код едет из HEAD (git archive) — поэтому незакоммиченные правки не выкатываются, а фронт
# собирается из того же дерева: при грязном дереве скрипт останавливается. Фронт собирается
# в dev-контейнере локально: на сервере 2 ГБ памяти, сборка Vite туда не влезает.
set -euo pipefail

FORCE_UPDATE=0
CADDY_ONLY=0
for arg in "$@"; do
  if [ "$arg" = "--force-update" ]; then FORCE_UPDATE=1; fi
  if [ "$arg" = "--caddy-only" ]; then CADDY_ONLY=1; fi
done

HOST="${GINGER_HOST:-ginger}" # алиас из ~/.ssh/config
DOMAIN="${GINGER_DOMAIN:-lisa52.com}"
APP_DIR="/opt/ginger/app"
COMPOSE="docker compose -f docker-compose.prod.yml"

# Caddy — единственный вход на сервер, и ради нового Caddyfile его не перезапускаем: файл сначала
# проверяет работающий Caddy, потом перечитывает на лету. Каталог deploy/caddy смонтирован в
# контейнер целиком и при деплое не удаляется (см. том caddy в docker-compose.prod.yml).

# Проверка Caddyfile из HEAD работающим Caddy (через stdin), пока на сервере ничего не тронуто:
# с ошибкой в файле сайт лёг бы при первом же перезапуске контейнера. Caddy не запущен (первый
# деплой) — проверять некому, файл проверит сам запуск.
caddy_check() {
  local out
  if ! out="$(git show HEAD:deploy/caddy/Caddyfile | ssh "$HOST" "cd $APP_DIR && \
    if $COMPOSE ps -q --status running caddy 2>/dev/null | grep -q .; then \
      $COMPOSE exec -T caddy caddy validate --config - --adapter caddyfile; \
    else cat >/dev/null; echo 'Caddy не запущен — проверка пропущена'; fi" 2>&1)"; then
    echo "$out" | grep -v '"level":"info"' >&2
    echo "Caddyfile не прошёл проверку — на сервере ничего не менялось." >&2
    exit 1
  fi
  echo "$out" | grep -v '"level":"info"' || true
}

# up -d пересоздаёт Caddy, только если поменялись его образ или настройки в compose, а сам Caddy
# за файлом не следит. reload меняет конфиг без обрыва соединений, без изменений — ничего не делает.
# Только что пересозданному контейнеру нужна пара секунд на запуск — отсюда повторы.
caddy_reload() {
  local out
  for _ in $(seq 1 10); do
    if out="$(ssh "$HOST" "cd $APP_DIR && $COMPOSE exec -T caddy \
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile" 2>&1)"; then
      return 0
    fi
    sleep 3
  done
  echo "$out" | grep -v '"level":"info"' >&2
  echo "Caddy не перечитал Caddyfile: ssh $HOST 'cd $APP_DIR && $COMPOSE logs --tail=50 caddy'" >&2
  exit 1
}

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незакоммиченные изменения — сначала коммит." >&2
  exit 1
fi
REVISION="$(git rev-parse --short HEAD)"
# Номер сборки фронта: клиент шлёт его в X-Client-Build, сервер сравнивает с минимальным.
BUILD_ID="$(date -u +%Y%m%d%H%M%S)"

echo "==> Проверка Caddyfile"
caddy_check

if [ "$CADDY_ONLY" = 1 ]; then
  echo "==> Caddyfile на сервер"
  git show HEAD:deploy/caddy/Caddyfile | ssh "$HOST" "set -e; \
    cd $APP_DIR/deploy/caddy 2>/dev/null || { echo 'На сервере нет deploy/caddy — нужен полный деплой' >&2; exit 1; }; \
    cat > Caddyfile.new; mv Caddyfile.new Caddyfile"
  echo "==> Caddy перечитывает Caddyfile"
  caddy_reload
  echo "OK: Caddyfile из $REVISION, остальной код на сервере — $(ssh "$HOST" cat "$APP_DIR/REVISION")"
  exit 0
fi

echo "==> Сборка фронта ($REVISION)"
docker compose exec -T -e VITE_APP_BUILD="$BUILD_ID" frontend npm run build

echo "==> Код на сервер"
# Всё, кроме .env, frontend-dist и смонтированного в Caddy deploy/caddy, удаляется; файлы в
# deploy/caddy tar заменит сам.
git archive --format=tar HEAD | ssh "$HOST" "set -e; cd $APP_DIR; \
  find . -mindepth 1 -maxdepth 1 ! -name .env ! -name frontend-dist ! -name deploy -exec rm -rf {} +; \
  if [ -d deploy ]; then find deploy -mindepth 1 -maxdepth 1 ! -name caddy -exec rm -rf {} +; fi; \
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
ssh "$HOST" "cd $APP_DIR && $COMPOSE up -d --build --remove-orphans \
  && docker image prune -f >/dev/null"

echo "==> Caddy перечитывает Caddyfile"
caddy_reload

echo "==> Проверка"
for _ in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/api/v1/health" >/dev/null 2>&1; then
    echo "OK: https://${DOMAIN} — $REVISION"
    exit 0
  fi
  sleep 5
done
echo "Сервис не ответил за 150 секунд: ssh $HOST 'cd $APP_DIR && $COMPOSE logs --tail=80'" >&2
exit 1
