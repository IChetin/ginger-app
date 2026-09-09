# Day2 — Архитектура и стек

Источник правды по архитектуре. При расхождении кода с этим документом — следовать документу и указать на расхождение. Полное продуктовое ТЗ: `docs/TZ.md`.

## 1. Что за продукт

**Day2** — PWA для игроков живых покерных турниров (МТТ) в РФ/Беларуси/на Кипре.
Ядро (MVP): расписание серий → закладки с push-напоминаниями → личный трекер результатов (ROI/ABI). Админка с импортом расписаний (парсеры + ИИ-фолбэк). MVP полностью бесплатный.
Фаза 2: партнёрские отборы, Telegram-бот уведомлений, подписка. Фаза 3: социалка, доли.

## 2. Стек (зафиксирован)

| Слой | Технологии |
|---|---|
| Frontend | Vite + React 18 + TypeScript (strict) + Tailwind CSS + React Router + TanStack Query + vite-plugin-pwa + Recharts |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic + Pydantic v2 + argon2-cffi + WeasyPrint (PDF) + Jinja2 + qrcode |
| Worker | Python 3.12 + APScheduler + pywebpush |
| БД | PostgreSQL 16 |
| Парсеры | `openpyxl` + `pdfplumber` + `pytesseract` (BPT/RPT image) в `app/services/imports/parsers/` (APC XLSX, RPF PDF, BPT PDF/OCR, RPT schedule OCR, RPT structures) + mock AI; Anthropic / EAPT — later |
| Email | SMTP-адаптер (российский провайдер через env) + mock для dev |
| Инфра | Docker Compose, Caddy (TLS), VPS в РФ, GitHub Actions |

## 3. Структура репозитория (монорепо)

```
day2/
├── docs/                  # ARCHITECTURE.md, db_schema.md, TODO.md, TZ.md, design/, design_gaps.md
├── frontend/              # Vite + React SPA (PWA)
│   └── src/
│       ├── api/           # HTTP-клиент, типы ответов
│       ├── config/        # фиче-флаги (VITE_*)
│       ├── components/    # UI-компоненты (layout, series, tracker, admin primitives, …)
│       ├── features/      # доменная логика: hooks, queryKeys, api-обёртки, guards
│       │                  # (admin, auth, bookmarks, hands, push, schedule, tracker)
│       ├── pages/         # тонкие экраны-композиции (+ pages/admin/*)
│       ├── hooks/         # общие хуки вне домена
│       └── lib/           # утилиты (time, money, plural, statusLabels, theme, …)
├── backend/
│   └── app/
│       ├── api/           # роутеры FastAPI (v1)
│       ├── core/          # конфиг, безопасность, зависимости
│       ├── models/        # SQLAlchemy-модели (зеркало db_schema.md)
│       ├── schemas/       # Pydantic-схемы
│       ├── services/      # бизнес-логика (auth, schedule, tracker, notifications, imports)
│       └── alembic/       # миграции
├── worker/                # планировщик: пуши, курсы валют
├── docker-compose.yml     # postgres, backend, worker, frontend, caddy
├── Caddyfile              # edge: /api/*, /series/*, /events/*, /hand/* → backend, /* → frontend
└── .cursor/rules/project.mdc
```

Страницы тонкие: маршрут и композиция в `pages/` (или `features/*/…Page.tsx` для auth/bookmarks/tracker), запросы и мутации — в `features/<domain>/`. Админские экраны живут в `pages/admin/*`; в `features/admin/` — hooks, API, guards и импорт.
## 4. Компоненты

- **frontend** — SPA, общается только с backend по REST (`/api/v1/...`). Сервис-воркер: кэш оболочки + stale-while-revalidate для расписания. Push-подписка (VAPID).
- **backend** — FastAPI: публичное API расписания, auth, закладки, трекер, раздачи, `/api/v1/admin/*` (по ролям). Пишет события в `change_log`, задания в `notification_queue`. Публичные `/series/*`, `/events/*`, `/hand/*` на Caddy проксируются сюда: канон/404 и для `/hand/:slug` инъекция `og:*` в SPA HTML (точечный пререндер, не SSR).
- **worker** — отдельный процесс. Каждую минуту: выборка «дозревших» записей `notification_queue` → отправка Web Push → статус sent/failed (до 3 ретраев). Ежедневно: загрузка курсов ЦБ РФ в `fx_rates`. Никакого Redis — очередь живёт в Postgres.
- **postgres** — единственное хранилище состояния.

## 5. Ключевые потоки

### 5.1 Авторизация (раздельные вход и регистрация)
Два явных пути: `/login` и `/register`. Server-side сессия `day2_session` (httpOnly cookie, TTL 30 дней, **скользящее окно**: `sessions.expires_at` и cookie `max_age` продлеваются на каждом аутентифицированном запросе).

**Вход (`/login`):** email + пароль → `POST /auth/login`. Ошибка всегда «Неверный email или пароль». Lockout: ≤5 неудачных попыток за 15 минут на аккаунт и на IP (русские сообщения). Ссылки «Войти по коду из письма» / «Забыли пароль?» → `POST /auth/request-code` **только если аккаунт существует**; иначе `account_not_found` без письма + CTA на `/register`. После OTP-входа без пароля (legacy) — неблокирующий шит «Задайте пароль…» (`POST /auth/set-password`).

**Регистрация (`/register`, три шага):**
1. Email + согласие ПДн → `POST /auth/register/start`. Если аккаунт есть → `account_exists` без письма + ссылка на вход; иначе OTP (в БД только `otp_codes`).
2. Код → `POST /auth/register/verify` → короткий `registration_token` (`auth_tokens.purpose=register`, `user_id` NULL, TTL 30 мин). User ещё не создаётся.
3. Пароль (обязателен) + никнейм → `POST /auth/register/complete` → user + сессия.

**OTP (login):** rate limit 1/60 сек на адрес, ≤5/сутки, лимит на IP; капча с 3-го запроса кода за сутки; HMAC-хэш (TTL 5 мин, ≤5 попыток); `POST /auth/verify` только для существующего пользователя (без upsert).

**Антиперебор email:** после 5 existence-проб (`account_not_found` / `account_exists`) с IP за час — капча (`account_lookup`).

**Пароль:** обязателен при регистрации; мин. 8 символов, блок top-1000 (`app/data/common_passwords.txt`), Argon2id. В профиле — `set-password` / `change-password`. `users.password_hash` nullable для legacy OTP-only аккаунтов.

`GET/PATCH /auth/me` — профиль (`email_verified`, `has_password`, …). Гостевые закладки мигрируют через `POST /bookmarks/migrate` после логина.

**Email-адаптер:** интерфейс `EmailProvider` + `MockEmailProvider` (dev/test). В production `mock` запрещён. Код/токен не возвращается API (кроме `registration_token` после verify регистрации).

**Антифрод:** капча на OTP с 3-го запроса и на existence-пробах; Origin/Referer guard; `SameSite=Lax`; в prod `SESSION_COOKIE_SECURE=true`. `SUPERADMIN_EMAILS` + `/admin/users` как раньше.

Удалены: `POST /auth/check-email`, link-based `register` / `verify-email` / `forgot-password` / `reset-password`.

### 5.2 Напоминания и уведомления об изменениях
Закладка (`bookmarks`) хранит интервалы в минутах (`reminder_offsets`; пресеты `15/60/120/360/1440/2880`, дефолт профиля `{1440,120}`). Time-based reminders — на `flight` (`scheduled_at = start_at − offset`). Series-закладка ставит `series_starting` за 7 и 1 день в 10:00 `venues.timezone`. Прошедшие `scheduled_at` не ставятся. Удаление закладки: pending удаляются, sent/failed сохраняются с `bookmark_id=NULL`.

**Change fan-out (этап 6):** правка опубликованного объекта в админке — двухшаговый preview/confirm (`POST .../preview` → HMAC `X-Preview-Token` → PATCH/PUT). Опционально `X-Notify: 0` на confirm: `change_log` пишется, enqueue в `notification_queue` пропускается (`notified_at` остаётся NULL). По умолчанию `X-Notify` = true. В одной транзакции при notify=true: мутация + `change_log` + distinct-user enqueue (`change_log_id`, типы `schedule_published` / `time_changed` / `event_cancelled` / `guarantee_changed` / `series_cancelled`) + пересчёт pending reminders / series_starting. Series-закладки: публикация, даты, отмена, series_starting. Flight-закладки: перенос времени, отмена турнира, гарантия (один push на пользователя при нескольких флайтах). Экран `/bookmarks`: auth overview + `GET /notifications/history?days=30`; публичный `POST /bookmarks/resolve-targets` гидратит guest IndexedDB; overview несёт структурированные display-поля (series/status/organizer/venue/event/flight).

Web Push: `GET /push/vapid-public-key`, upsert/delete `POST|DELETE /push/subscribe` (`DELETE` идемпотентен: нет строки → 204). Permission — только явным действием после первой серверной закладки. Worker (APScheduler, раз в минуту, `FOR UPDATE SKIP LOCKED`): fan-out на все подписки пользователя; успех ≥1 устройства → `sent`; 404/410 → удалить подписку; retryable до 3 попыток; нет подписок / VAPID 401/403 → `failed`. Frontend: `vite-plugin-pwa` injectManifest + `src/sw.ts`; manifest/icons/offline/iOS — этап 9.

### 5.3 Импорт расписаний и структур (парсер-пайплайн)
Импорт в **существующую** `series` или с **созданием серии** в том же `POST /admin/import` (`create_series=true` + organizer/venue/name/dates). Загрузка `xlsx/csv/pdf/jpg/png` до `IMPORT_MAX_FILE_BYTES` (20 МБ): исходник в `import_jobs.file_data` (BYTEA), API blob не отдаёт. Опциональный `file_timezone` (IANA) — пояс времён в файле; на publish `date`+`time` → UTC через него, иначе через `venues.timezone`. Разбор **синхронный** (`import_kind=schedule|structures`): `uploaded → parsing → review|failed`.

**Schedule** (`apc_xlsx_v1`, `rpf_pdf_v1`, `bpt_pdf_v1`, `rpt_schedule_ocr_v1`): пустая announced series → events/flights. Magic-bytes детект → выбор парсера (явный `parser_requested` → привязка организатора `schedule_parser_id` → авто `supports`) → порог `0.8` / нет парсера → mock AI (`ai_unavailable` без выдуманного расписания). Профили парсеров — таблица `parser_profiles` (title/active); админка `/admin/parsers` + выбор в карточке организатора. Явный/привязанный парсер обходит slug-гейт; если привязанный не подошёл к файлу — автоподбор, затем ИИ (заметка в `parser_mismatch_reason`). Редактор может явно выбрать парсер (`parser_requested`: `auto` / имя / `ai_only`); несовместимый тип файла блокируется до разбора. `bpt_pdf_v1` / `rpt_schedule_ocr_v1` — OCR (tesseract) для JPG/сканов PDF + группировка флайтов; BPT валюта из файла (`$` → USD), RPT — RUB. После разбора событие обогащается: `parse_path` (code|ai), `source_fragment`, `field_confidence` (по issues). Валидация: даты series, buy-in ≥ 0 (0 = freeroll warning), валюта, уникальные номера, flights. Publish только в пустую series → `schedule_published` + fan-out.

**Structures** (`rpt_structure_pdf_v1`): непустая series → draft matching structure→event (name+buy-in suggest, ручное подтверждение) → replace `blind_levels` с `structure_set_label` (`default`/`1A`/`1B`). Выбор: явный → `structure_parser_id` организатора → авто. Shared `ALL SATELLITES` применяется к выбранным satellite events. Status series не меняется; `change_log` на blinds.

HMAC preview/confirm переиспользуется. Статистика включает `by_kind`. Админка: `/admin/import` (stepper + dropzone + сверка по `admin_import.html`), review schedule/structures. EAPT PDF и production Anthropic — pending.

**Массовая загрузка серий** (`import_kind=bulk_xlsx`, `POST|GET /admin/import/bulk`, шаблон `docs/rasp_samples/day2_series_upload.xlsx`, копия для скачивания — `frontend/public/`): один xlsx с листом «Турниры», строка = старт. Идемпотентность по `series.import_key` (`series_key`), `(series_id, events.import_key)` (`event_key`) и `flights.label` внутри турнира — повторная заливка обновляет, а не дублирует; записи без `import_key` (заведённые вручную) в сопоставлении не участвуют. Строки-примеры шаблона отсеиваются по SHA256-отпечатку нормализованных значений строки, а не по заливке ячеек. Замечания несут адрес ячейки (строка + буква колонки); ошибка блокирует публикацию, предупреждение — нет. Организаторы, площадки и страны создаются автоматически (сопоставление по имени без регистра и лишних пробелов) и показываются в предпросмотре отдельным блоком; валюта обязана быть в справочнике — иначе ошибка (курса в `fx_rates` для самопальной валюты нет). Пустая ячейка = «в файле нет данных», а не «стереть значение». `POST .../preview` считает план (создать / обновить / без изменений / нет в файле), diff по полям и число получателей push; токен предпросмотра привязан к галочке «отметить отсутствующие как отменённые». `POST .../publish` применяет всё одной транзакцией с обычным change fan-out (`X-Notify` уважается), исчезнувшие турниры по умолчанию не трогает, отчёт кладёт в `import_jobs.draft.report`. Экран — `/admin/import/bulk` (загрузка + история) и `/admin/import/bulk/{job_id}` (предпросмотр, галочки, публикация, отчёт).

### 5.4 Трекер и валюты
Результаты приватны владельцу (`GET/POST/PATCH/DELETE /results`; чужой id → 404). Linked (`event_id`) сохраняет server-side snapshot name/series/venue/buyin/currency; manual требует name + played_on + buyin + currency. `GET /results` принимает те же date/series/buy-in фильтры, что stats, и возвращает `profit_base`/`base_currency` для строки списка. Auth-only `GET /results/search-events` ищет прошедшие опубликованные события для linked-ввода; `GET /results/currencies` отдаёт справочник валют. `my_share_pct` в MVP скрыт (=100%).

Агрегаты (`GET /stats`, `/stats/chart`, `/stats/filters`, `/stats/filter-counts`) — только `Decimal`, в `users.base_currency`. Конвертация: `amount × source.rate_rub / base.rate_rub`, где `fx_rates.rate_rub` = рублей за 1 ед. валюты (ЦБ `Value/Nominal`); RUB = 1. Курс — latest `rate_date ≤ played_on` в окне 7 дней; иначе `fx_rate_missing` (409), сам результат при этом сохраняется. Фильтры: `buyin` пресеты `lt10k|10-50k|gte50k` (после FX в базовую) или legacy `buyin_min/max`; `series` (CSV UUID + `none` = без серии), `venues` (CSV), `result=itm,no_itm`; series/venue/country — только для linked results (кроме `none`).

Публичное расписание: `GET /series` принимает мульти-фильтры `countries`, `organizers`, `buyin` (пресеты в базовой валюте пользователя / RUB для гостя; серия проходит, если ≥1 турнир в диапазоне), `status=actual|live_soon|upcoming|<SeriesStatus>`, даты `starts_from/starts_to`. Для `status=finished` сортировка `ends_on DESC` (архив). Семантика сегментов главной (не exact DB enum): `running` = `announced|schedule_published|running` **и** `starts_on ≤ today ≤ ends_on`; `announced` = статус `announced` **и** `starts_on > today` (legacy API, таб на главной снят). Ответ списка — `SeriesListResponse`: `items`/`total`/`limit`/`offset` + `counts: { all, running, archive }` по тем же предметным фильтрам и датам, независимо от активного `status` (`all` = `actual`). `GET /series/filter-counts` — `total` + facet-счётчики по странам/организаторам/бай-ину (с учётом того же `status`/дат). UI фильтров — общий `components/filters` на главной и трекере; состояние в URL (`replace: false`). Главная: сегменты `?status=all|running|archive` (API: `actual` / `running` / `finished`); `?status=announced` тихо мапится на «Все». Анонсы остаются секцией внутри «Все». Пресеты периода: в актуальных сегментах — вперёд, в архиве — назад (`month`/`3m`/`year`/`all`); архив — infinite scroll.

Worker ежедневно (cron `FX_JOB_CRON`, default `15 1 * * *` UTC) тянет CBR XML Daily (stdlib urllib) для BYN/USD/EUR + backfill по distinct `results.played_on`. Share-card трекера — серверный PNG (`GET /stats/share-card.png`, WeasyPrint HTML→PDF→pdftoppm, Manrope локально, дисковый кэш как у schedule PDF); фронт: touch → Web Share файлом, desktop → download.

## 6. Соглашения по данным

- **Время**: в БД только `timestamptz` (UTC). Таймзона площадки — `venues.timezone` (IANA). «Время у вас» — `users.timezone` (IANA, nullable; NULL = авто из браузера). Отображение: время площадки + локальное время пользователя. Конвертация только на границах (ввод в админке / рендер). Тексты push в MVP относительные («через 2 ч»), без абсолютного HH:MM.
- **Деньги**: `numeric(12,2)`, код валюты отдельным полем (FK на `currencies`). Никаких float.
- **ID**: UUID v4 (генерирует БД). Enum-ы — на уровне БД (native enum) и продублированы в Python.
- **API**: REST, JSON, snake_case; версия в пути `/api/v1`; пагинация limit/offset; ошибки — единый формат `{error: {code, message}}`.
- **PWA/iOS**: пуши на iOS работают только после установки на главный экран → обязательный онбординг-экран установки для iOS.
- **Темы**: две темы (тёмная «чёрно-золотая» и светлая «кремовый люкс», эталон — `docs/design/styleguide_themes.html`) на CSS-переменных с одинаковыми ИМЕНАМИ в `frontend/src/index.css`; меняются только значения. Компоненты о теме не знают — только токен-классы Tailwind (`@theme inline` → `var(--token)`), хардкод цветов запрещён. Режимы: `system` (по умолчанию, `prefers-color-scheme`) / `dark` / `light`; ручной выбор — атрибут `data-theme` на `<html>`, он побеждает системный. Выбор устройства (не аккаунта): источник правды — IndexedDB `day2-preferences`, синхронное зеркало — cookie `day2_theme` для инлайн-скрипта в `index.html`, который применяет тему до первого рендера (без FOUC). Золотой градиент-заливка одинаков в обеих темах, золотой ТЕКСТ в светлой — тёмная бронза (`--gold: #8A6A2B`) ради контраста.

## 7. Окружения и деплой

`dev` — docker-compose локально, `.env` из `.env.example`. `prod` — тот же compose на VPS в РФ (152-ФЗ: БД и бэкапы только в РФ), Caddy с авто-TLS, ежедневный `pg_dump`. CI: линт (ruff, eslint) + тесты (pytest, vitest) + сборка образов; деплой — вручную запускаемый workflow. Секреты — только переменные окружения.

## 8. Отвергнутые решения (не предлагать повторно)

| Решение | Причина отказа |
|---|---|
| Next.js / любой SSR-фреймворк | Выбран Vite+React SPA; SEO-ограничение принято осознанно, при необходимости — точечный пререндер |
| Node.js-бэкенд (NestJS и т.п.) | Бэкенд на Python/FastAPI — решение владельца, синергия с парсерами |
| Supabase (cloud и self-hosted) | Свой бэкенд + чистый Postgres; cloud нарушает 152-ФЗ |
| Вход через Telegram / Google / Apple | Запрещено 406-ФЗ для российских ресурсов. Легальная альтернатива на будущее — VK ID |
| Вход по SMS/телефону | Отменён владельцем (стоимость, зарубежные SIM, SMS pumping) |
| Единый экран «система сама решает» вход/регистрацию | Отклонено: вход и регистрация разделены; пароль обязателен при регистрации; OTP на незарегистрированные адреса не отправляется. JWT не используем (server-side sessions) |
| Firebase / FCM | Пуши через стандарт VAPID (pywebpush), без зависимости от Google |
| Redis / BullMQ / Celery | Очередь и планировщик на Postgres + APScheduler достаточны для целевого масштаба |
| GraphQL | REST достаточен |
| Микросервисы | Монолит backend + один worker |
| ORM кроме SQLAlchemy | Стек зафиксирован |
| ИИ-парсинг как путь по умолчанию | Сначала шаблонные парсеры, ИИ — только фолбэк (экономия токенов) |
| Онлайн-турниры и кэш в трекере (MVP) | Только live_mtt; enum расширяем позже |

## 9. Правовые ограничения (влияют на код)

- **152-ФЗ**: email = ПДн → БД, бэкапы, логи с ПДн — только на серверах в РФ. Не логировать email в plaintext.
- Телеграм-бот для *уведомлений* (фаза 2) легален — это не авторизация.

## 10. История изменений

| Дата | Что изменено |
|---|---|
| 2026-09-01 | Демо-режим раздач: список — фронтовые фикстуры; реплеер/шеринг — три публичные руки в БД под системным пользователем (`/hand/demo-1`…`demo-3`, email `demo-hands@day2.pro`), сид на старте, аккаунт скрыт из админки и auth |
| 2026-08-30 | `DELETE /push/subscribe` идемпотентен (нет строки → 204): после 410 воркер уже удалил подписку, иначе тогл в профиле зависал на «Не удалось отключить» |
| 2026-08-30 | Главная: Все · Идут · Архив со счётчиками (`GET /series.counts`) и кнопкой фильтров в одной строке; чипсы только при активных фильтрах; таб «Анонсы» снят |
| 2026-08-26 | Массовая загрузка: колонка `start_blinds` → `events.start_blinds` (текст как в сетке, не структура блайндов) |
| 2026-08-24 | Реплеер: шапка — заголовок сжимается (min 80px, две строки), Фишки/BB под столом; карты оппонентов всегда скрыты до вскрытия; рубашка с «2»; имена без карандаша |
| 2026-08-24 | Эквити: только против вскрытых рук; vs random за `VITE_EQUITY_VS_RANDOM` (для диапазонов 13×13) |
| 2026-08-24 | Раздачи: `hands.series_id` (серия целиком, XOR с `event_id`); `GET /hands/link-targets` — live → сегодня → идущие серии → поиск `q` |
| 2026-08-22 | Новая раздача: slug на клиенте, сразу `/hand/{slug}` без перемонтирования; `POST /draft` принимает клиентский slug |
| 2026-08-22 | Черновик раздачи получает `slug` при создании (не при публикации); единый `/hand/:slug` (автор — ввод, остальные — 404); опубликованная — реплеер + OG; `/hand/draft/{id}` — 301 автору |
| 2026-08-22 | Массовая загрузка серий из Excel (`import_kind=bulk_xlsx`): идемпотентность по `import_key`, предпросмотр с diff и числом push, транзакционная публикация, автосоздание организаторов/площадок/стран, экран `/admin/import/bulk` |
| 2026-08-21 | Ввод раздачи: общий движок `features/hands/lib/hand-engine/` (визард, стол, реплеер) + паритет с `hand_engine.py`; столовый режим (`users.hand_input_mode`, фиче-флаг `VITE_HAND_INPUT_MODES`) |
| 2026-08-19 | Реплеер: `users.hide_holes_until_showdown` — карты оппонентов и полное эквити только на шаге вскрытия; до него эквити против случайных рук |
| 2026-08-19 | Черновики раздач на сервере: `hands.status` draft/published, автосейв IndexedDB+outbox, публикация выдаёт slug |
| 2026-08-19 | Раздачи: два режима анте (`bb` по умолчанию / `occupied`); анте может быть 0; JSON без `ante_mode` — легаси `table_size × ante` |
| 2026-08-19 | Ввод раздачи: один черновик IndexedDB (`current`) не восстанавливается молча; экран «Продолжить / Начать заново», пометка старше 7 дней, сброс из шапки, удаление после save |
| 2026-08-19 | Запись раздачи: банк/вложение/профит всегда из движка (клиентские цифры не блокируют save) |
| 2026-08-19 | Раздачи: BB в составе обязателен, SB опционален (dead button); стартовый банк `(SB если есть) + BB + table_size × ante` |
| 2026-08-16 | GET раздач читает jsonb без повторной проверки банка/профита — старые документы не валят список |
| 2026-08-16 | Реплеер: `users.stack_display` (`chips`/`bb`) — стеки, банк, ставки и лог в больших блайндах; тап по стеку + сегмент в шапке |
| 2026-08-16 | Раздачи: SB/BB можно не отмечать в составе — мёртвые блайнды всё равно в банке; очередь действий на улице совпадает с ходом |
| 2026-08-13 | Реплеер раздач: таблица `hands` (jsonb `data`, короткий `slug`), CRUD `/api/v1/hands`, публичный `/hand/:slug` с OG PNG 1200×630 |
| 2026-08-13 | Трекер: `result_events` + форма результата как live-экран (хронология входов/заметок); finish live копирует события в результат |
| 2026-08-12 | Живые сессии: `live_sessions`/`live_events`, API `/live-sessions*`, офлайн-first на клиенте (IndexedDB + batch sync) → финиш пишет в `results`; кандидаты = закладки + фаза «Идут» (`announced|schedule_published|running` ∩ даты) + опц. `event_id`/`flight_id` |
| 2026-08-05 | Главная «Идут»/«Анонсы»: `GET /series?status=running|announced` по датам (`effectiveSeriesPhase`), не только по DB enum |
| 2026-07-31 | Импорт: парсер `rpt_schedule_ocr_v1` (JPG/PNG/image-PDF расписания RPT через tesseract); дефолтная schedule-привязка организатора `rpt` |
| 2026-07-31 | Админка парсеров: `parser_profiles` (title/active), привязка к организатору (`schedule_parser_id` / `structure_parser_id`); UI `/admin/parsers`; порядок выбора при импорте: явный → привязка → авто → ИИ |
| 2026-07-31 | Админка серий: hard delete при отсутствии закладок/результатов (иначе 409); ручной переход `schedule_published → finished`; кнопка «Удалить серию» |
| 2026-07-30 | Импорт: организатор BPT; парсер `bpt_pdf_v1` (OCR tesseract для image-PDF); явный выбор парсера (`parser_requested`) + `GET /admin/parsers` с типами/описанием |
| 2026-07-30 | Публичные URL: `series.slug` / `events.slug` + `slug_redirects`; канон `/series/{slug}`, `/events/{series.slug}-{event.slug}`; UUID/old-slug → HTTP 301 через Caddy→backend; API принимает slug\|UUID |
| 2026-07-30 | Share-card трекера: `GET /stats/share-card.png` (WeasyPrint→pdftoppm PNG 1080×1080, Day2-айдентика, кэш, QR); фронт touch/desktop share как у PDF |
| 2026-07-30 | Полное расписание серии: `GET /series/{id}/schedule` + `GET /series/{id}/schedule.pdf` (WeasyPrint, кэш на диске, QR, Manrope локально); поля `buyin_bounty` / `day_end_note`; экран `/series/:id/schedule` |
| 2026-07-30 | Главная: фильтры × сегмент — один билдер query; в архиве past-пресеты периода; facet-counts и empty-state с учётом сегмента |
| 2026-07-30 | Главная: сегмент «Архив» (`?status=all|running|announced|archive`); `GET /series?status=finished` сортирует по `ends_on DESC`; infinite scroll архива |
| 2026-07-29 | Auth: раздельные `/login` и `/register`; пароль обязателен при регистрации; OTP только для существующих аккаунтов; `auth_tokens.purpose=register|account_lookup`, nullable `user_id` + `email` |
| 2026-07-28 | Компактные карточки серий (`cards_compact.html`): `today_events_count`/`highlight` в `GET /series`; логотипы организаторов (BYTEA + `/media/organizers/{id}/logo`) |
| 2026-07-28 | `users.timezone` (nullable IANA) + выбор в профиле; «время у вас» через `getUserTimezone()`; ABI = invested/entries |
| 2026-07-28 | Фильтры v2 (`filters_v2.html`): общий UI `components/filters`, URL-state (multi), `GET /series/filter-counts` + `/stats/filter-counts`, бай-ин пресеты с FX на `/series`, status `live_soon` |
| 2026-07-28 | Рефакторинг перед ручным тестированием: структура `frontend/src` уточнена (`features/`, `lib/*`); расхождения с макетами вынесены в `docs/design_gaps.md`; `db-init` монтирует `./docs:/docs:ro` для сидов из `rasp_samples` |
| 2026-07-26 | Админ-дашборд: `GET /admin/dashboard` (алерты/KPI/upcoming/recent), UI `/admin` по `admin_dashboard.html`; фильтры `empty_events`/`stale` на `GET /admin/series` |
| 2026-07-28 | MVP1: публичный `GET /search`; inbox `GET/POST /notifications` + `unread-count` + `read_at`; экраны `/search`, `/notifications`; закладки без вкладки «История» |
| 2026-07-26 | Админка справочников + журнал: `venues.slug`; `GET /admin/parsers`; `GET /admin/change-log` (фильтры + delivery из `notification_queue`, `via_import`); UI `/admin/venues`, `/admin/organizers`, `/admin/change-log` по `admin_dicts.html` / `admin_changelog.html` |
| 2026-07-26 | Импорт: `file_timezone`, create-series в upload; per-event `parse_path` / `source_fragment` / `field_confidence`; UI `/admin/import` по `admin_import.html` |
| 2026-07-26 | Админка серий: `X-Notify` на confirm (change_log всегда, fan-out опционален); фильтры `GET /admin/series`; `bookmarks_count`; `GET /admin/series/{id}/changes` |
| 2026-07-26 | Светлая тема «кремовый люкс» + переключатель: токены обеих тем на CSS-переменных (`index.css`), Tailwind-цвета через `@theme inline`, режимы system/dark/light, хранение выбора в IndexedDB + cookie-зеркало, инициализация до первого рендера, динамический `theme-color` |
| 2026-07-26 | Управление ролями: `SUPERADMIN_EMAILS` (все окружения) + `/admin/users` (list/search/PATCH role, только admin; защита себя и env-суперадминов) |
| 2026-07-26 | Password auth: регистрация email+пароль, подтверждение/сброс по одноразовой ссылке (`auth_tokens`), Argon2id; OTP сохранён как альтернатива; server-side sessions без JWT |
| 2026-07-21 | Авторизация переведена с телефона/SMS на email OTP: SMTP-адаптер + mock, `users.email` как идентификатор, `users.phone` nullable (фаза 3), антифрод под email-бомбинг |
| 2026-07-20 | `/profile` redesign по `page_profile.html`: отдельные sheets настроек, device push toggle, полная очистка cache при logout, iOS Safari install banner и `/install`; support URL через `VITE_TELEGRAM_SUPPORT_URL` |
| 2026-07-20 | `/tracker` redesign по `page_tracker.html`: URL-фильтры, infinite results с base profit, guest value screen, add/edit/delete sheet; `/results/search-events` и `/results/currencies` |
| 2026-07-20 | `/bookmarks` redesign по `page_bookmarks.html`: structured overview fields, public `POST /bookmarks/resolve-targets`, guest/server UI + history tabs, deferred delete/undo, live BottomNav badge |
| 2026-07-19 | Auth OTP: `retry_after` в request-code/429, `otp_invalid`+`attempts_left`, `otp_expired`; фронт `/login` по `page_login.html` + `/privacy` stub, returnTo в router state |
| 2026-07-19 | GET `/events/{id}`: `VenueBrief.address`; фронт карточки турнира по `page_event.html` (facts/flights/blinds/venue, inline reminders, CTA результата, BottomNav скрыт) |
| 2026-07-19 | GET `/series/{id}`: `EventSummary` + stack/re-entry + полные flights для sibling chips; фронт страницы серии по `page_series.html` |
| 2026-07-19 | GET `/series`: `status=actual`, алиасы `country`/`organizer`/`max_buyin`, поле `min_buyins[]`; фронт главной по `page_home.html` (токены Day2, BottomNav) |
| 2026-07-19 | Этап 8 parsers: APC XLSX + RPF PDF schedule, RPT structure PDF + `structure_set_label`, freeroll buy-in 0, seeds APC/RPF; EAPT/Anthropic — pending |
| 2026-07-19 | Этап 8 foundation: `import_jobs` BYTEA + sync parse pipeline (registry/mock AI, порог 0.8), admin import API + атомарная публикация в пустую series (HMAC preview), UI сверки/stats |
| 2026-07-19 | Этап 7: CRUD `/results`, stats/chart/filters с Decimal FX, worker CBR daily+backfill, фронт `/tracker` + Recharts + Canvas share-card |
| 2026-07-19 | Этап 6: admin preview/confirm рассылки (HMAC token), change_log → notification_queue fan-out, series_cancelled + change_log_id, пересчёт reminders/series_starting, экран «Мои закладки» + history 30 дней |
| 2026-07-18 | Этап 5: гостевые/серверные закладки, профильные reminder offsets, VAPID subscribe API, worker reminder delivery (pywebpush, SKIP LOCKED, retry/410), injectManifest SW foundation |
| 2026-07-18 | Этап 4 (частичный): публичный OTP/auth + профиль, SmartCaptcha, SMS mock/fail-closed, IP rate-limit hash; production SMS-провайдер ещё не выбран |
| 2026-07-18 | Этап 3: ручная админка — dev OTP/session, role guards, CRUD venues/organizers/series/events/flights/blinds, атомарный `change_log` для опубликованного контента; UI `/admin` |
| 2026-07-18 | Этап 0: монорепо-каркас; compose включает отдельный `frontend` + edge `caddy` + `worker`-скелет; ТЗ переименовано в `docs/TZ.md` |
| 2026-07-18 | Первая версия документа (по итогам проектной сессии) |
