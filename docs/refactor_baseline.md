# Базовая линия перед рефакторингом

Зафиксировано: 2026-07-26. Коммит: `dc1e41a` (`feat: переходы из админки в приложение`), рабочее дерево чистое.

Цель документа — точка отсчёта. После рефакторинга результат должен быть **не хуже** этих значений.

## Как воспроизвести

```bash
docker compose --profile test up -d postgres_test        # pytest backend
cd backend && uv sync --all-groups && uv run pytest
cd worker  && uv sync --all-groups && uv run pytest
cd frontend && npm ci && npm test && npm run build
cd frontend && E2E_BASE_URL=http://localhost:8080 \
  E2E_DATABASE_URL=postgresql://day2:day2@localhost:5432/day2 npx playwright test
```

Окружение прогона: Python 3.12.3, Node 22.23.1, uv 0.11.29, дев-контур на `HTTP_PORT=8080`.

## 1. Тесты

| Набор | Результат | Тестов | Время |
|---|---|---|---|
| Backend pytest | **зелёный** | 191 passed | 162 с |
| Worker pytest | **зелёный** | 11 passed | 0.8 с |
| Frontend vitest | **зелёный** | 202 passed (48 файлов) | 75 с |
| Playwright E2E | **зелёный с оговоркой** | 6 сценариев | 38 с / 15 с |

### Нестабильный тест (flaky)

`frontend/e2e/registration.spec.ts:22` — «register → verify via db → login migrates guest bookmarks».

- Прогон 1: упал на первой попытке, прошёл с retry (`1 flaky`). Общее время из-за ретрая 38 с.
- Прогон 2: прошёл с первой попытки. Общее время 15 с.
- Место падения: `e2e/registration.spec.ts:34` — после `page.goto("/bookmarks")` ожидание `getByText(seriesName)` не дождалось элемента за 20 с.
- Похоже на гонку миграции гостевых закладок из IndexedDB после логина. Конфиг Playwright уже имеет `retries: 1`, поэтому в отчёте это «flaky», а не «failed».

Остальные 5 сценариев прошли с первой попытки в обоих прогонах.

## 2. Линтеры и типы — уже красные ДО рефакторинга

Это состояние **не является** результатом рефакторинга и, по условию задачи, в рамках рефакторинга не чинится.

| Проверка | Статус | Детали |
|---|---|---|
| backend `ruff check` | **красный** | 15 ошибок (9 автофиксимых) |
| backend `ruff format --check` | **красный** | 12 файлов требуют переформатирования |
| backend `mypy app` | **красный** | 15 ошибок в 5 файлах |
| worker `ruff check` / `format` / `mypy` | зелёный | — |
| frontend `eslint` | зелёный | 0 ошибок, 9 предупреждений |
| frontend `prettier --check` | **красный** | 112 файлов |
| frontend `tsc -b` (в составе build) | зелёный | — |

### Следствие: CI на `main` сейчас упал бы

`.github/workflows/ci.yml` запускает ровно эти команды как обязательные шаги:

- job `backend`: `ruff check` (строка 49), `ruff format --check` (52), `mypy app` (55) — **все три падают**;
- job `frontend`: `npm run format:check` (121) — **падает**;
- job `images` зависит от `backend`/`worker`/`frontend` (183) и потому не выполнится.

### Ошибки backend `ruff check` (15)

| Файл | Правило |
|---|---|
| `app/alembic/versions/g3c9e1f48a72_import_file_timezone.py:8` | I001 |
| `app/alembic/versions/h4d0f2a59b83_venues_slug.py:8` | I001 |
| `app/api/v1/schedule.py:1` | I001 |
| `app/seeds/sample_schedules.py:1` | I001 |
| `app/seeds/sample_schedules.py:14` | F401 (`GameType` не используется) |
| `app/seeds/sample_schedules.py:31,113,316,348,391` | E501 (длина строки) |
| `app/seeds/sample_schedules.py:84` | SIM114 |
| `app/seeds/sample_schedules.py:366` | SIM102 |
| `app/services/schedule.py:1` | I001 |
| `tests/test_admin_dashboard_api.py:18` | F401 (`ImportJob`) |
| `tests/test_bookmarks_api.py:251` | I001 |

### Ошибки backend `mypy` (15 в 5 файлах)

| Файл | Строки | Суть |
|---|---|---|
| `app/services/admin_dashboard.py` | 447, 454 | присваивание `Event \| None` переменной типа `Event` |
| `app/seeds/sample_schedules.py` | 49, 142, 155 | `object` вместо `UUID`; два неиспользуемых `type: ignore` |
| `app/services/admin_references.py` | 347 | `StructureParser` присваивается переменной типа `ScheduleParser` (несовместимый `parse`) |
| `app/services/imports/jobs.py` | 121 | присваивание `Series \| None` переменной типа `Series` |

### Предупреждения frontend `eslint` (9, не блокируют)

- `react-refresh/only-export-components`: `components/admin/RoleBadge.tsx:24`, `components/admin/StatusBadge.tsx:50,54`, `components/ui/badge.tsx:49`.
- `react-hooks/exhaustive-deps`: `pages/admin/AdminChangeLogPage.tsx:236`, `AdminOrganizersPage.tsx:96`, `AdminSeriesDetailPage.tsx:339` (×2), `AdminVenuesPage.tsx:90`.

## 3. Метрики «до»

### Размер кода по слоям

| Слой | Файлов | Строк |
|---|---|---|
| `backend/app/api` | 20 | 1 404 |
| `backend/app/services` | 42 | 10 297 |
| `backend/app/models` | 9 | 945 |
| `backend/app/schemas` | 16 | 1 601 |
| `backend/app/core` | 8 | 424 |
| `backend/app/seeds` | 7 | 733 |
| `backend/app/utils` | 3 | 98 |
| `backend/app/alembic` | 11 | 1 326 |
| `backend/tests` | 25 | 6 237 |
| `worker/worker` | 14 | 852 |
| `worker/tests` | 2 | 349 |
| `frontend/src/api` | 13 | 1 985 |
| `frontend/src/components` | 83 | 8 240 |
| `frontend/src/features` | 105 | 10 126 |
| `frontend/src/pages` | 27 | 8 745 |
| `frontend/src/lib` | 17 | 1 212 |
| `frontend/src/hooks` | 4 | 98 |
| `frontend/src/test` | 3 | 208 |
| `frontend/e2e` | 9 | 617 |
| `frontend/src/index.css` | 1 | 399 |

Итого backend `app`: 116 файлов / 16 828 строк. Frontend `src`: 253 файла / 31 013 строк.

### Топ-10 самых больших файлов

| Строк | Файл |
|---|---|
| 1 980 | `frontend/src/pages/admin/AdminEventDetailPage.tsx` |
| 1 401 | `backend/app/services/admin_schedule.py` |
| 894 | `frontend/src/pages/admin/AdminSeriesDetailPage.tsx` |
| 889 | `backend/app/services/auth.py` |
| 641 | `frontend/src/pages/admin/AdminSeriesPage.tsx` |
| 625 | `backend/app/alembic/versions/953907ed750d_initial_schema.py` |
| 590 | `frontend/src/features/admin/import/ImportReviewPage.tsx` |
| 579 | `backend/app/services/schedule.py` |
| 572 | `frontend/src/pages/admin/AdminDashboardPage.tsx` |
| 554 | `frontend/src/components/admin/EventEditModal.tsx` |

### Продакшн-бандл фронта (`npm run build`, vite 6.4.3)

| Артефакт | Размер | gzip |
|---|---|---|
| `dist/assets/index-*.js` | 1 326.64 kB | 383.29 kB |
| `dist/assets/index-*.css` | 82.02 kB | 15.05 kB |
| `dist/assets/workbox-window.prod.es5-*.js` | 5.75 kB | 2.36 kB |
| `dist/assets/virtual_pwa-register-*.js` | 0.76 kB | 0.46 kB |
| `dist/sw.mjs` | 17.88 kB | 6.19 kB |
| `dist/index.html` | 2.79 kB | 1.34 kB |
| **precache (PWA)** | **1 384.72 KiB** | — |

Модулей трансформировано: 2 967. Время сборки: 10.6 с (полная команда с `tsc -b` — 31 с).
Vite предупреждает, что чанк больше 500 kB (кода-сплиттинга нет — это ожидаемо и в рамках рефакторинга не меняется).

### Время прогонов

| Команда | Время |
|---|---|
| `backend: uv run pytest` | 166 с |
| `worker: uv run pytest` | 1.5 с |
| `frontend: npm test` | 76 с |
| `frontend: npm run build` | 31 с |
| `frontend: npx playwright test` | 40 с (с ретраем) / 17 с (без) |

## 4. Что считаем «не хуже» на выходе

- Backend pytest: ≥ 191 passed, 0 failed.
- Worker pytest: ≥ 11 passed, 0 failed.
- Vitest: 0 failed. Число тестов может **уменьшиться на 15** (202 → 187), если будет согласовано удаление мёртвого кода: 8 тестовых файлов покрывают модули, которых нет в проде (см. `refactor_plan.md`, A.2). Любое другое уменьшение — регресс.
- Playwright: 6 сценариев, 0 failed.
- Бандл: `index-*.js` ≤ 1 326.64 kB, precache ≤ 1 384.72 KiB.
- Линтеры: не хуже текущего красного состояния (то есть число ошибок ruff/mypy/prettier не растёт).
