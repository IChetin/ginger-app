# Day2

PWA для игроков живых покерных турниров (МТТ) в РФ / Беларуси / на Кипре.

Документация: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/TODO.md`](docs/TODO.md) · [`docs/db_schema.md`](docs/db_schema.md) · [`docs/TZ.md`](docs/TZ.md)

## Требования

- Docker 24+ и Compose v2
- Для локальной разработки без Docker: Python 3.12 + [uv](https://docs.astral.sh/uv/), Node.js 20+ и npm

## Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```

Если хост уже слушает `:80`, задайте в `.env` другой порт, например `HTTP_PORT=8080`.

После старта (порт из `HTTP_PORT`, по умолчанию `80`):

| URL | Описание |
|---|---|
| http://localhost:${HTTP_PORT}/ | Frontend (Vite, через Caddy) |
| http://localhost:${HTTP_PORT}/api/v1/health | Healthcheck backend |
| http://localhost:${HTTP_PORT}/api/v1/series | Лента серий (read-only) |
| http://localhost:${HTTP_PORT}/calendar | Календарь серий |
| http://localhost:${HTTP_PORT}/login | Вход по email (OTP) |
| http://localhost:${HTTP_PORT}/profile | Профиль (после входа) |
| http://localhost:${HTTP_PORT}/bookmarks | Мои закладки и история уведомлений |
| http://localhost:${HTTP_PORT}/admin | Админка (роли editor/admin) |
| http://localhost:${HTTP_PORT}/admin/users | Пользователи и роли (только admin) |
| http://localhost:${HTTP_PORT}/admin/import | Импорт расписания (editor/admin) |

В `APP_ENV=development` при `SEED_DEMO_DATA=true` `db-init` создаёт три опубликованные серии из `docs/rasp_samples/` (APC XLSX, RPF PDF, RPT Altai structures). В production держите `SEED_DEMO_DATA=false`.

### Авторизация (development / mock email)

1. Откройте `/login` (или `/admin/login` → редирект на `/login?next=/admin`).
2. Email. Dev staff: admin `SEED_ADMIN_EMAIL` (`admin@example.com`), editor `SEED_EDITOR_EMAIL` (`editor@example.com`).
3. При `EMAIL_PROVIDER=mock` код = `DEV_OTP_CODE` (по умолчанию `123456`). Код не возвращается API; в dev пишется в лог backend вместе с замаскированным email.
4. Повторный запрос кода после 60 сек требует капчу: в mock — токен `CAPTCHA_MOCK_TOKEN` (`ok`); в prod — Yandex SmartCaptcha (`SMARTCAPTCHA_SERVER_KEY` + `VITE_SMARTCAPTCHA_CLIENT_KEY`).
5. После verify — httpOnly cookie `day2_session`. Профиль: `/profile` (никнейм, email в шапке, базовая валюта, интервалы напоминаний).
6. **editor** — CRUD расписания; **admin** — то же + площадки, организаторы и пользователи. Staff-роли по seed-email только в development.
7. Production: права через `SUPERADMIN_EMAILS` (comma-separated) в `.env` — при логине роль становится `admin`, понизить через UI нельзя. Далее остальных редакторов назначайте в `/admin/users`.
8. Production без настроенного SMTP — fail-closed (`email_unavailable`). `SESSION_COOKIE_SECURE=true` обязателен за HTTPS. Для прода нужны SPF, DKIM и DMARC на домене отправки (см. TODO этап 10).

### Закладки и Web Push (этап 5)

1. Гость может сохранить закладку (серия / флайт) в IndexedDB без входа; для синхронизации и напоминаний нужен логин — после verify локальные закладки мигрируют (`POST /bookmarks/migrate`, при конфликте server wins).
2. Напоминания вешаются на **флайт**. Пресеты: 15м / 1ч / 2ч / 6ч / 24ч / 48ч. Дефолты профиля: `default_reminder_offsets` (`{1440,120}`).
3. Сгенерируйте VAPID-ключи (см. комментарий в `.env.example`) и заполните `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. Private key нужен только worker; API отдаёт public key.
4. После первой **серверной** закладки UI предлагает «Включить напоминания» — permission запрашивается только по явной кнопке (не автоматически).
5. Worker каждую минуту забирает due `notification_queue` (`FOR UPDATE SKIP LOCKED`), шлёт Web Push, ретраи ≤3, удаляет 404/410 подписки.
6. Клик по уведомлению открывает same-origin URL из payload (`/events/{id}` или `/series/{id}`). Manifest/icons/offline/iOS-онбординг — этап 9.

### Изменения → уведомления (этап 6)

1. В админке правка **опубликованной** серии/события/флайтов: `POST .../preview` → диалог (diff, получатели, примеры push) → confirm с заголовком `X-Preview-Token`.
2. Устаревший token → `preview_stale` (409); нужно запросить preview снова. Токен подписан HMAC (`PREVIEW_HMAC_SECRET`, TTL `PREVIEW_TOKEN_TTL_SECONDS`).
3. После confirm: атомарно `change_log` + fan-out в `notification_queue` + пересчёт pending reminders / `series_starting` (7д и 1д в 10:00 venue-local).
4. Экран `/bookmarks`: подписки с ближайшим стартом, правка интервалов флайта, история `sent` за 30 дней.

Dev smoke (mock sender в тестах; реальный браузерный push — вручную на desktop/Android):

```bash
# после compose up и заполненных VAPID_*
# 1) user: login → bookmark flight → enable reminders → subscribe
# 2) admin: preview → confirm перенос флайта → в очереди time_changed + обновлённые reminder
# 3) ускорить due: UPDATE notification_queue SET scheduled_at = now() - interval '1 minute' WHERE status='pending';
# 4) worker → status=sent → клик по notification / история в /bookmarks
```

### Трекер результатов (этап 7)

1. После логина: `/tracker` — карточки ROI/ABI/ITM, фильтры, Recharts cumulative profit, список результатов.
2. Linked-результат: карточка турнира → «Добавить результат» → `/tracker/results/new?event_id=...` (snapshot buyin/currency с сервера).
3. Manual: `/tracker/results/new` — произвольные name/venue/series/buyin/currency/date.
4. Курсы: worker cron `FX_JOB_CRON` (default `01:15` UTC) грузит CBR XML в `fx_rates` + backfill по `results.played_on`. Без курса stats отвечает `fx_rate_missing` (409).
5. «Поделиться» рисует PNG в браузере (Canvas) и шарит/скачивает локально — на сервер картинка не уходит.

### Импорт расписания и структур (этап 8)

1. **Schedule:** создайте пустую announced-серию с organizer APC/RPF/RPT, затем `/admin/import` или «Импорт из файла». Образцы: `docs/rasp_samples/`.
2. Загрузка `xlsx/csv/pdf/jpg/png` ≤ 20 МБ в Postgres BYTEA. Парсеры: `apc_xlsx_v1`, `rpf_pdf_v1`; иначе mock AI / `ai_unavailable`. Порог `0.8`. Freeroll = buy-in `0` (warning).
3. Сверка → preview/confirm → публикация только в **пустую** series (`schedule_published` + fan-out).
4. **Structures (RPT):** на серии с events — «Импорт структур» (`import_kind=structures`). Matching structure→event вручную подтверждается; publish пишет `blind_levels` с наборами `default`/`1A`/`1B`.
5. EAPT PDF и production Anthropic — ещё не реализованы.

Остановка: `docker compose down`.

## Структура

```
day2/
├── docs/           # архитектура, схема БД, ТЗ, план работ
├── frontend/       # Vite + React SPA
├── backend/        # FastAPI
├── worker/         # APScheduler (пуши, курсы валют)
├── docker-compose.yml
└── Caddyfile
```

## Локальная разработка без Docker

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
SEED_DEMO_DATA=true uv run python -m app.seeds
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

### Worker

```bash
cd worker
uv sync
uv run python -m worker.main
```

## Проверки качества

```bash
# Тестовая PostgreSQL (отдельный контейнер на :5433) — для pytest
docker compose --profile test up -d postgres_test

# Backend (изолированная day2_test, rollback на тест)
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest

# Worker
cd worker && uv run ruff check . && uv run ruff format --check . && uv run mypy worker && uv run pytest

# Frontend unit
cd frontend && npm run lint && npm run format:check && npm test && npm run build

# E2E (Playwright против дев-контура; не на проде)
# Нужны: поднятый compose, доступ к Postgres :5432
cd frontend
E2E_BASE_URL=http://localhost:8080 \
E2E_DATABASE_URL=postgresql://day2:day2@localhost:5432/day2 \
npm run test:e2e

# Зачистка TEST_-данных в дев-БД после E2E
DATABASE_URL=postgresql://day2:day2@localhost:5432/day2 \
  backend/.venv/bin/python scripts/cleanup_test_data.py --dry-run
DATABASE_URL=postgresql://day2:day2@localhost:5432/day2 \
  backend/.venv/bin/python scripts/cleanup_test_data.py

# Pre-commit (один раз: uvx pre-commit install)
uvx pre-commit run --all-files
```

Миграции проверяются отдельно:

```bash
cd backend
uv run alembic upgrade head
uv run alembic check
```

## Переменные окружения

Скопируйте `.env.example` → `.env`. Секреты не коммитить. Полный список — в `.env.example`.
