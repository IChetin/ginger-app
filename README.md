# Ginger APP

PWA для игроков клуба Ginger: заявки на фишки, расписание турниров клубов, диалоги с менеджером и пуши. Замена Telegram-боту как основному каналу связи.

Прод: https://lisa52.com · деплой и сервер: [`deploy/README.md`](deploy/README.md)

Продуктовые документы (концепт, спецификация экранов, план сборки, реестр вопросов) живут вне репозитория, в рабочей папке проекта.

## Стек

- **Frontend:** Vite, React 18, TypeScript, Tailwind 4, TanStack Query, vite-plugin-pwa
- **Backend:** FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2, PostgreSQL 16
- **Worker:** APScheduler — рассылка Web Push из `notification_queue`, курсы ЦБ
- **Инфраструктура:** Docker Compose, Caddy (HTTPS на проде)
- **Почта:** `mock` в разработке, на проде Yandex Cloud Postbox по HTTPS API (`EMAIL_PROVIDER=postbox`)

База проекта — форк Day2: от него остались вход, пуши, очередь уведомлений и админка. Модели Day2 (серии, трекер, реплеер) удалены.

## Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```

Если `:80` занят, задайте в `.env` другой порт, например `HTTP_PORT=8080`.

| URL | Что там |
|---|---|
| http://localhost/ | Приложение (Vite через Caddy) |
| http://localhost/api/v1/health | Healthcheck backend |
| http://localhost/login | Вход по паролю или коду из письма |
| http://localhost/admin | Админка: касса, игроки, сетки клубов, диалоги |

### Вход в разработке

- `EMAIL_PROVIDER=mock` — письма не отправляются, код входа = `DEV_OTP_CODE` (`123456`).
- Staff-аккаунты из сидов: `SEED_ADMIN_EMAIL` (`admin@example.com`), `SEED_EDITOR_EMAIL`.
- Регистрация игрока — только по приглашению: админский инвайт или личная ссылка игрока `/r/<код>`.

### На проде

- Админы — через `SUPERADMIN_EMAILS` в `.env`; первый аккаунт: `python -m app.seeds.create_admin`, пароль: `python -m app.seeds.set_password`.
- Секреты (ключи Postbox и т. п.) вписывает владелец скриптом `deploy/set-env-secret.sh`, в чат и в репозиторий они не попадают.
- Сетка клуба из CSV: `python -m app.seeds.import_grid` (читает stdin, без `--apply` только показывает изменения). Сетки NUTS и Private.G забираются автоматически раз в день.

## Структура

```
ginger-app/
├── frontend/       # PWA: React + Vite, фирменные шрифты в public/fonts
├── backend/        # FastAPI, миграции Alembic, шаблоны писем
├── worker/         # APScheduler: пуши, курсы валют
├── deploy/         # прод: compose, Caddy, деплой, бэкапы, секреты
├── scripts/        # служебные скрипты дев-контура
├── docker-compose.yml
└── Caddyfile
```

## Проверки качества

```bash
# Тестовая PostgreSQL на :5433
docker compose --profile test up -d postgres_test

# Backend
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest

# Worker
cd worker && uv run ruff check . && uv run ruff format --check . && uv run mypy worker && uv run pytest

# Frontend
cd frontend && npm run lint && npm run format:check && npm test && npm run build
```

Миграции:

```bash
cd backend
uv run alembic upgrade head
uv run alembic check
```

Локальная база и учётка Postgres по-прежнему называются `day2` — это только дев-контур и CI; на проде база `ginger`.

## Переменные окружения

Полный список с комментариями — в `.env.example`. Секреты не коммитить.
