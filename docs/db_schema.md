# Day2 — Схема базы данных (PostgreSQL 16)

Источник правды по структуре БД. Любое изменение структуры (таблица, поле, индекс, enum) — сначала здесь и в Alembic-миграции, затем запись в «Историю изменений».

Соглашения: PK — `uuid` (default `gen_random_uuid()`), время — `timestamptz` (UTC), деньги — `numeric(12,2)`, у изменяемых таблиц `created_at`/`updated_at` (`timestamptz`, default `now()`).

## Enum-типы

- `user_role`: `user` | `editor` | `admin`
- `results_visibility`: `private` | `itm_only` | `full` — *(интерфейс — фаза 3, поле с MVP)*
- `stack_display`: `chips` | `bb` — отображение стеков в реплеере (фишки или большие блайнды)
- `hand_input_mode`: `wizard` | `table` — оболочка ввода раздачи (визард или стол)
- `card_deck`: `classic` | `four_color` — цвета мастей на картах (двухцветная или четырёхцветная колода)
- `hand_status`: `draft` | `published` — черновик ввода или опубликованная раздача
- `auth_token_purpose`: `email_verify` | `password_reset` | `login_attempt` | `register` | `account_lookup`
- `series_status`: `announced` | `schedule_published` | `running` | `finished` | `cancelled`
- `event_status`: `scheduled` | `changed` | `cancelled`
- `game_type`: `nlh` | `plo` | `plo5` | `mixed` | `other`
- `entry_type`: `live_mtt` — *(расширяется в фазах 2–3: `online_mtt`, `cash`)*
- `bookmark_target`: `series` | `flight`
- `notification_status`: `pending` | `sent` | `failed`
- `notification_type`: `reminder` | `schedule_published` | `time_changed` | `event_cancelled` | `guarantee_changed` | `series_starting` | `series_cancelled`
- `change_type`: `created` | `updated` | `cancelled` | `schedule_published`
- `import_status`: `uploaded` | `parsing` | `review` | `published` | `failed`
- `import_kind`: `schedule` | `structures` | `bulk_xlsx` — вид задания импорта (events/flights, blind levels, массовая загрузка серий)
- `parse_path`: `code` | `ai` | `mixed`
- `live_session_status`: `active` | `finished` | `cancelled`
- `live_event_type`: `entry` | `reentry` | `note`

## Аутентификация и пользователи

### users
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| email | varchar(255) | UNIQUE, NOT NULL — идентификатор входа (lowercase + trim) |
| password_hash | text | NULL — Argon2id; NULL = legacy OTP-only (пароль обязателен при новой регистрации) |
| email_verified_at | timestamptz | NULL — NULL = email не подтверждён (password login запрещён) |
| nickname | varchar(32) | NOT NULL; UNIQUE INDEX `uq_users_nickname_lower` ON `lower(nickname)` — любой Unicode (2–32, не только цифры); оригинал как ввёл пользователь, уникальность без учёта регистра |
| avatar_url | text | NULL |
| phone | varchar(16) | NULL — необязательный контакт (фаза 3) |
| base_currency | char(3) | FK → currencies.code, default 'RUB' |
| timezone | varchar(64) | NULL — IANA (напр. `Europe/Moscow`); NULL = авто из браузера |
| stack_display | stack_display | NOT NULL, default `'chips'` — реплеер: фишки или BB |
| hide_holes_until_showdown | boolean | NOT NULL, default `true` — карты оппонентов в реплеере всегда скрыты до вскрытия; поле не переключается в UI |
| hand_input_mode | hand_input_mode | NOT NULL, default `'table'` — ввод раздачи: визард или стол |
| card_deck | card_deck | NOT NULL, default `'four_color'` — колода: классическая (ч/к) или четырёхцветная; личное предпочтение, не из админки |
| results_visibility | results_visibility | default 'private' |
| role | user_role | default 'user' |
| default_reminder_offsets | integer[] | NOT NULL, default '{1440,120}' — минуты до старта |
| created_at, updated_at | timestamptz | |

### otp_codes
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| email | varchar(255) | NOT NULL |
| code_hash | text | NOT NULL — хэш, не plaintext |
| request_ip_hash | varchar(64) | NULL — HMAC/SHA-256 IP (без plaintext) |
| attempts | smallint | default 0, max 5 |
| expires_at | timestamptz | NOT NULL (now + 5 мин) |
| used_at | timestamptz | NULL |
| created_at | timestamptz | |

Индексы: `(email, created_at)`, `(request_ip_hash, created_at)` — для rate limit.

### auth_tokens
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, NULL для `register` / `account_lookup`, ON DELETE CASCADE |
| email | varchar(255) | NULL — для `register` и `account_lookup` |
| purpose | auth_token_purpose | `email_verify` \| `password_reset` \| `login_attempt` \| `register` \| `account_lookup` |
| token_hash | text | NOT NULL — HMAC-SHA256 plaintext-токена (для login_attempt / account_lookup — служебная запись) |
| request_ip_hash | varchar(64) | NULL |
| expires_at | timestamptz | NOT NULL |
| used_at | timestamptz | NULL |
| created_at | timestamptz | |

Индексы: `(user_id, purpose, created_at)`, `(token_hash)`, `(request_ip_hash, created_at)`, `(email, purpose, created_at)`.

### sessions
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK — значение сессионной cookie |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| user_agent | text | NULL |
| expires_at | timestamptz | NOT NULL |
| created_at, last_seen_at | timestamptz | |

### push_subscriptions
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| endpoint | text | UNIQUE, NOT NULL |
| p256dh, auth | text | NOT NULL — ключи Web Push |
| device_label | varchar(64) | NULL |
| created_at, last_success_at | timestamptz | |

## Справочники

### countries — `code char(2) PK` (ISO 3166-1), `name_ru varchar(64)`
### currencies — `code char(3) PK` (RUB, BYN, USD, EUR), `symbol varchar(4)`
### organizers
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| name | varchar(128) | NOT NULL |
| slug | varchar(64) | UNIQUE NOT NULL |
| links | jsonb | NOT NULL, default `{}` |
| logo_data | bytea | NULL — загруженный логотип (PNG/SVG/WebP) |
| logo_content_type | varchar(64) | NULL — MIME загруженного логотипа |
| schedule_parser_id | uuid | NULL, FK → parser_profiles ON DELETE SET NULL — парсер расписаний |
| structure_parser_id | uuid | NULL, FK → parser_profiles ON DELETE SET NULL — парсер структур |
| created_at, updated_at | timestamptz | |

Публичный URL: `GET /api/v1/media/organizers/{id}/logo` (если есть blob). Иначе фолбэк на `links.logo`.

Индекс поиска: GIN `pg_trgm` на `name` (`ix_organizers_name_trgm`).

### parser_profiles
Профили шаблонных парсеров (1:1 с кодом в `app/services/imports/parsers/`). Строки создаёт sync по реестру; редактор меняет только title / is_active / notes.

| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| code | varchar(64) | UNIQUE NOT NULL — имя из реестра (`apc_xlsx_v1`, …) |
| title | varchar(128) | NOT NULL — человекочитаемое название для админки |
| kind | varchar(16) | NOT NULL, `schedule` \| `structures` |
| is_active | boolean | NOT NULL, default true — выключенный не участвует в авто/привязке |
| is_available | boolean | NOT NULL, default true — false если код удалён из реестра |
| notes | text | NULL |
| created_at, updated_at | timestamptz | |

### fx_rates
| Поле | Тип | Ограничения |
|---|---|---|
| currency_code | char(3) | FK → currencies, часть PK |
| rate_date | date | часть PK |
| rate_rub | numeric(14,6) | NOT NULL — рублей за 1 ед. валюты (`Value / Nominal` ЦБ РФ); RUB в коде = 1 без строки в таблице; кросс-курсы через RUB; для выходных/праздников хранится фактическая `Date` из XML, resolver берёт latest ≤ `played_on` за ≤7 дней |

### venues
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| country_code | char(2) | FK → countries, NOT NULL |
| city | varchar(64) | NOT NULL |
| name | varchar(128) | NOT NULL |
| slug | varchar(64) | UNIQUE NOT NULL |
| zone | varchar(64) | NULL — игорная зона |
| timezone | varchar(64) | NOT NULL — IANA, напр. `Europe/Kaliningrad` |
| address | text | NULL |
| lat, lng | numeric(9,6) | NULL |
| logo_url | text | NULL |
| created_at, updated_at | timestamptz | |

UNIQUE на `slug` в БД: индекс `ix_venues_slug` (имя из миграции; функционально эквивалентно `uq_venues_slug`).
Индексы поиска: GIN `pg_trgm` на `name` (`ix_venues_name_trgm`), на `city` (`ix_venues_city_trgm`).

## Расписание

### series
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| organizer_id | uuid | FK → organizers, NOT NULL |
| venue_id | uuid | FK → venues, NOT NULL |
| name | varchar(160) | NOT NULL |
| slug | varchar(120) | UNIQUE NOT NULL — публичный URL `/series/{slug}` |
| import_key | varchar(64) | NULL — `series_key` из шаблона массовой загрузки; NULL у заведённых вручную |
| starts_on, ends_on | date | NOT NULL |
| status | series_status | default 'announced' |
| guarantee | numeric(14,2) | NULL — общая гарантия серии |
| guarantee_currency_code | char(3) | FK → currencies, NULL |
| poster_url | text | NULL |
| links | jsonb | default '{}' — сайт, telegram и т.д. |
| description | text | NULL |
| created_at, updated_at | timestamptz | |

Индексы: `(status, starts_on)`, `(venue_id)`; UNIQUE `slug` (`uq_series_slug`); GIN `pg_trgm` на `name` (`ix_series_name_trgm`).
UNIQUE `import_key` — частичный индекс `uq_series_import_key` (`WHERE import_key IS NOT NULL`): серии без ключа не конфликтуют между собой.

### events
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| series_id | uuid | FK → series, NOT NULL, ON DELETE CASCADE |
| number | smallint | NULL — № в сетке серии |
| name | varchar(160) | NOT NULL |
| slug | varchar(120) | NOT NULL — короткий слаг внутри серии (`5-main-event`); публичный URL `/events/{series.slug}-{slug}` |
| import_key | varchar(64) | NULL — `event_key` из шаблона массовой загрузки; NULL у заведённых вручную |
| buyin | numeric(12,2) | NOT NULL |
| buyin_bounty | numeric(12,2) | NULL — ноклаут-часть только для отображения (`prize+bounty`); `buyin` = полный бай-ин |
| currency_code | char(3) | FK → currencies, NOT NULL |
| guarantee | numeric(14,2) | NULL |
| game_type | game_type | default 'nlh' |
| tags | text[] | default '{}' — turbo, bounty, deepstack, satellite… |
| start_stack | integer | NULL |
| start_blinds | varchar(32) | NULL — стартовые блайнды как в сетке (`100/200`, `100/200/200`); не структура |
| reentry_count | smallint | NULL — кол-во ре-энтри |
| reentry_unlimited | boolean | default false |
| late_reg_level | smallint | NULL |
| day_end_note | varchar(40) | NULL — «уровень в день» / ITM% / final table (PDF) |
| status | event_status | default 'scheduled' |
| notes | text | NULL |
| created_at, updated_at | timestamptz | |

Индекс: `(series_id, number)`; UNIQUE `(series_id, slug)` (`uq_events_series_id_slug`); GIN `pg_trgm` на `name` (`ix_events_name_trgm`).
UNIQUE `(series_id, import_key)` — частичный индекс `uq_events_series_id_import_key` (`WHERE import_key IS NOT NULL`).
Примечание: у Event нет собственного времени старта — время живёт во flights (у турнира без флайтов ровно один флайт с label = NULL).

### slug_redirects
Редиректы со старых публичных слагов (серия или compound-ключ турнира).

| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| entity_type | varchar(16) | NOT NULL — `series` \| `event` |
| entity_id | uuid | NOT NULL |
| old_slug | varchar(120) | NOT NULL — то, что было в URL-сегменте |
| created_at | timestamptz | NOT NULL |

UNIQUE `(entity_type, old_slug)`; индекс `(entity_type, entity_id)`.

### flights
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| event_id | uuid | FK → events, NOT NULL, ON DELETE CASCADE |
| label | varchar(16) | NULL — 'Day 1A', 'Day 1B'; NULL = единственный старт |
| start_at | timestamptz | NOT NULL — UTC; отображение через venues.timezone |
| level_minutes | varchar(16) | NULL — длительность уровня как в расписании (`30`, `25/20`), без разбора |

Индексы: `(event_id)`, `(start_at)` — для worker'а.

### blind_levels
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| event_id | uuid | FK → events, NOT NULL, ON DELETE CASCADE |
| structure_set_label | varchar(16) | NOT NULL, default `'default'` — набор (`default` / `1A` / `1B` / `Final`) |
| level_no | smallint | NOT NULL |
| sb, bb, ante | integer | NULL (у перерыва пусто) |
| minutes | smallint | NOT NULL |
| is_break | boolean | default false |
| is_late_reg_end | boolean | default false |

UNIQUE `(event_id, structure_set_label, level_no)`. Индекс: `(event_id)`.

### change_log
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| entity_type | varchar(16) | 'series' / 'event' / 'flight' |
| entity_id | uuid | NOT NULL |
| change_type | change_type | NOT NULL |
| old_value, new_value | jsonb | NULL — только изменённые поля |
| actor_id | uuid | FK → users, NULL (система) |
| notified_at | timestamptz | NULL — когда сгенерированы уведомления |
| created_at | timestamptz | |

Индекс: `(entity_type, entity_id, created_at)`.

## Закладки и уведомления

### bookmarks
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| target_type | bookmark_target | NOT NULL |
| target_id | uuid | NOT NULL — series.id или flights.id |
| reminder_offsets | integer[] | default '{1440,120}' — минуты до старта |
| created_at | timestamptz | |

UNIQUE `(user_id, target_type, target_id)`. Индекс: `(target_type, target_id)` — поиск подписчиков при изменениях.

### notification_queue
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| bookmark_id | uuid | FK → bookmarks, NULL, ON DELETE SET NULL — для reminder и series_starting |
| change_log_id | uuid | FK → change_log, NULL, ON DELETE SET NULL — fan-out изменений |
| type | notification_type | NOT NULL |
| payload | jsonb | NOT NULL — title, body, url |
| scheduled_at | timestamptz | NOT NULL |
| status | notification_status | default 'pending' |
| attempts | smallint | default 0, max 3 |
| last_error | text | NULL |
| sent_at | timestamptz | NULL |
| read_at | timestamptz | NULL — NULL = непрочитано; ставится при открытии inbox / «Прочитать всё» |
| created_at | timestamptz | |

Индексы: `(status, scheduled_at)` — выборка worker'а; `(bookmark_id)`; `(change_log_id)`; `(user_id, status, sent_at)` — inbox; частичный `(user_id) WHERE status='sent' AND read_at IS NULL` — unread-count; UNIQUE `(bookmark_id, scheduled_at)` WHERE `type = 'reminder' AND bookmark_id IS NOT NULL`; UNIQUE `(change_log_id, user_id, type)` WHERE `change_log_id IS NOT NULL`.

Расширение `pg_trgm` — для ILIKE-поиска серий/площадок/турниров (`GET /api/v1/search`).

## Трекер результатов

### results
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| entry_type | entry_type | default 'live_mtt' |
| event_id | uuid | FK → events, NULL — путь «из карточки» |
| name | varchar(160) | NOT NULL — копия/ручной ввод |
| venue_text, series_text | varchar(160) | NULL — для произвольных записей |
| played_on | date | NOT NULL — дата для курса валют |
| buyin | numeric(12,2) | NOT NULL |
| currency_code | char(3) | FK → currencies, NOT NULL |
| entries_count | smallint | default 1 — **выводится** из числа money-событий в `result_events` (entry+reentry); в агрегатах вложено = buyin × entries_count |
| payout | numeric(14,2) | default 0 |
| place | integer | NULL |
| field_size | integer | NULL |
| my_share_pct | numeric(5,2) | default 100 — **[задел фазы 3]**, в UI MVP скрыто |
| note | text | NULL — legacy; новые заметки в `result_events` |
| created_at, updated_at | timestamptz | |

Индекс: `(user_id, played_on)`.

### result_events
Хронология результата в трекере (зеркало `live_events` без soft-delete). При финише live-сессии активные события копируются сюда.

| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK **без server default** — клиентский UUID |
| result_id | uuid | FK → results, NOT NULL, ON DELETE CASCADE |
| type | live_event_type | NOT NULL — тот же enum (`entry` / `reentry` / `note`) |
| amount | numeric(12,2) | NULL — для entry/reentry |
| currency_code | char(3) | FK → currencies, NULL |
| text | varchar(500) | NULL — для note |
| occurred_at | timestamptz | NOT NULL |
| created_at | timestamptz | |

CHECK `type_payload`: note → text; entry/reentry → amount.  
Индекс `(result_id, occurred_at)`. Инварианты: ровно одно `entry`; ре-энтри ≥ 0; заметок сколько угодно.

## Живые сессии турнира

### live_sessions
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK — клиентский UUID (offline-идемпотентность); default `gen_random_uuid()` на случай server-side |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| event_id | uuid | FK → events, NULL, ON DELETE SET NULL — путь «из карточки» |
| flight_id | uuid | FK → flights, NULL, ON DELETE SET NULL |
| manual_name | varchar(160) | NULL — ручной турнир |
| manual_venue | varchar(160) | NULL |
| manual_buyin | numeric(12,2) | NULL |
| manual_currency | char(3) | FK → currencies, NULL |
| started_at | timestamptz | NOT NULL |
| finished_at | timestamptz | NULL |
| status | live_session_status | default `active` |
| place | integer | NULL — при финише |
| field_size | integer | NULL |
| payout | numeric(14,2) | NULL |
| result_id | uuid | FK → results, NULL, ON DELETE SET NULL |
| created_at, updated_at | timestamptz | |

CHECK `linked_or_manual`: либо `event_id`, либо (`manual_name` + `manual_buyin` + `manual_currency`).  
UNIQUE INDEX `uq_live_sessions_one_active` ON `(user_id) WHERE status = 'active'`. Индекс `(user_id, status)`.

### live_events
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK **без server default** — клиентский UUID |
| session_id | uuid | FK → live_sessions, NOT NULL, ON DELETE CASCADE |
| type | live_event_type | NOT NULL |
| amount | numeric(12,2) | NULL — для entry/reentry |
| currency_code | char(3) | FK → currencies, NULL |
| text | varchar(500) | NULL — для note |
| occurred_at | timestamptz | NOT NULL — редактируемое время события |
| created_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL — soft delete для sync |

CHECK `type_payload`: note → text NOT NULL; entry/reentry → amount NOT NULL.  
Индекс `(session_id, occurred_at)`.

## Раздачи (реплеер)

Чипы — целые числа (турнирные фишки), не `numeric` денег. `data.schema_version = 1`. Карты `^[2-9TJQKA][shdc]$`. `amount` действия = **сумма на улице после него**. Неколлированная часть ставки возвращается в стек и не входит в банк (олл-ин 100 против 80 → банк 80+80). Сайд-поты в MVP не считаются (`result.side_pots = null`).

`data.table_size` — 2–9 (хедз-ап = 2). Состав: ≥2 участника, есть герой и BB. SB опционален (dead button: игрок выбыл, малый не выставляется). Хедз-ап (`table_size = 2`): BTN и BB; BTN ставит SB. `data.blinds.ante` может быть 0 (анте нет). `data.blinds.ante_mode`: `bb` — одно анте платит BB; `occupied` — анте с каждого сидящего. Нет поля — легаси `table_size × ante` (пустые места входят в банк). Дальше `(SB, если место SB занято, иначе 0) + BB`. Деньги снятого SB в банк не идут. При записи банк / вложение / профит пересчитываются движком; чтение jsonb этот итог не перепроверяет.

### hands
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK — у черновика клиентский UUID (offline-идемпотентность) |
| user_id | uuid | FK → users, NOT NULL, ON DELETE CASCADE |
| slug | varchar(12) | NOT NULL; UNIQUE INDEX `uq_hands_slug`; 10 символов из `23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`; выдаётся при создании черновика, при публикации не меняется |
| event_id | uuid | FK → events, NULL, ON DELETE SET NULL |
| series_id | uuid | FK → series, NULL, ON DELETE SET NULL — привязка к серии целиком; CHECK `ck_hands_event_xor_series`: `event_id IS NULL OR series_id IS NULL` |
| live_session_id | uuid | FK → live_sessions, NULL, ON DELETE SET NULL |
| status | hand_status | NOT NULL, default `published` |
| current_step | smallint | NULL у опубликованных; 1–4 у черновиков |
| is_public | boolean | NOT NULL, default true; у черновиков всегда false |
| title | varchar(160) | NULL |
| note | text | NULL |
| data | jsonb | NOT NULL — опубликованная: документ раздачи; черновик: снимок визарда |
| views_count | integer | NOT NULL, default 0 |
| created_at, updated_at | timestamptz | NOT NULL |

Индексы: unique `slug`; `(user_id, created_at DESC)`; `(user_id, status, updated_at)`; partial `(user_id) WHERE status = 'draft'` (лимит 20 черновиков); partial `event_id IS NOT NULL`; partial `series_id IS NOT NULL`; GIN `pg_trgm` по `note`. CHECK `ck_hands_hand_status_shape`: published ⇒ slug NOT NULL и current_step NULL; draft ⇒ slug NOT NULL, is_public false, current_step 1–4.

Единый URL `/hand/{slug}`: черновик — только автор (остальным 404, без OG); опубликованная — по `is_public` + OG. Старый `/hand/draft/{id}`: автор — 301 на `/hand/{slug}`, чужой/гость — 404. API: `GET/PATCH/DELETE /api/v1/hands/{slug|id}`, `POST /api/v1/hands/draft` (клиентский `slug` опционален; коллизия — 409 `slug_taken`), `POST /api/v1/hands/{id}/publish`.

## Импорт расписаний

### import_jobs
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| uploaded_by | uuid | FK → users, NOT NULL |
| original_filename | varchar(255) | NOT NULL |
| content_type | varchar(128) | NOT NULL |
| file_size | bigint | NOT NULL — байты; лимит приложения `IMPORT_MAX_FILE_BYTES` (20 МБ) |
| file_sha256 | varchar(64) | NOT NULL |
| file_data | bytea | NOT NULL — приватный исходник в PostgreSQL (не отдаётся API) |
| detected_type | varchar(8) | 'xlsx' / 'csv' / 'pdf' / 'image' |
| import_kind | import_kind | default `'schedule'` — `schedule` (events/flights), `structures` (blind levels) или `bulk_xlsx` (массовая загрузка серий) |
| organizer_id | uuid | FK → organizers, NULL |
| series_id | uuid | FK → series, NULL — целевая серия |
| file_timezone | varchar(64) | NULL — IANA-пояс времён в файле (publish → UTC); иначе `venues.timezone` |
| parser_requested | varchar(64) | NULL — выбор редактора (`auto` хранится как NULL; `ai_only` или имя парсера) |
| parser_used | varchar(64) | NULL — имя фактически сработавшего парсера / AI |
| parse_path | parse_path | NULL |
| confidence | numeric(3,2) | NULL |
| tokens_input, tokens_output | integer | NULL — расход ИИ-фолбэка |
| estimated_cost_usd | numeric(12,6) | NULL — оценка стоимости ИИ (mock = 0) |
| fields_total, fields_corrected | integer | NULL — учёт правок редактора vs `initial_draft` |
| status | import_status | default 'uploaded' |
| initial_draft | jsonb | NULL — черновик сразу после парсинга |
| draft | jsonb | NULL — текущий editable черновик до публикации |
| error | text | NULL |
| created_at, published_at | timestamptz | |

Индекс: `(status, created_at)` — дашборд статистики.

У `bulk_xlsx` задание не привязано к серии: `series_id`, `organizer_id`, `file_timezone` пусты, а `draft` хранит `BulkImportDraft` (разобранные серии, замечания с адресами ячеек, отчёт публикации в `draft.report`).

## Заделы будущих фаз (таблиц в MVP НЕ создавать)

Фаза 2: `partners`, `qualifier_funnels`, `funnel_steps`, `partner_click_log`, `tg_links` (привязка Telegram-бота), `subscriptions`. Фаза 3: `follows`, `messages`, рынок долей (после юр. проработки). Текущая схема им не противоречит.

## История изменений

| Дата | Что изменено |
|---|---|
| 2026-08-26 | `events.start_blinds` — стартовые блайнды из сетки расписания (`100/200/200`); массовая загрузка колонка `start_blinds` |
| 2026-08-25 | `users.card_deck` (`classic` \| `four_color`, default `four_color`) — цвета мастей на картах; настройка профиля, не админки |
| 2026-08-24 | `hands.series_id` — привязка раздачи к серии целиком; CHECK `event_id IS NULL OR series_id IS NULL`; partial index `ix_hands_series_id` |
| 2026-08-24 | Реплеер: `users.hide_holes_until_showdown` больше не переключается в UI (колонка и default `true` сохранены) |
| 2026-08-22 | `hands.slug` NOT NULL у черновиков: выдаётся при создании, уникальный индекс без WHERE, при публикации не меняется; `/hand/{slug}` общий, `/hand/draft/{id}` — 301 автору |
| 2026-08-22 | Массовая загрузка: `series.import_key` / `events.import_key` (частичные UNIQUE), `series.guarantee` + `series.guarantee_currency_code`, `flights.level_minutes`, значение `bulk_xlsx` в enum `import_kind` |
| 2026-08-21 | `users.hand_input_mode` (`wizard` \| `table`, default `table`) — оболочка ввода раздачи |
| 2026-08-20 | Раздачи: `data.table_size` 2–9 (было 2 и 6–9) |
| 2026-08-19 | Раздачи: неколлированные фишки возвращаются в стек (не сайд-пот); в банк идёт покрытая часть |
| 2026-08-19 | `users.hide_holes_until_showdown` (boolean, default true) — реплеер скрывает карты оппонентов до шоудауна |
| 2026-08-19 | `hands.status` (`draft`/`published`), `current_step`, `slug` NULL у черновиков; `data` черновика = снимок визарда; лимит 20 черновиков на пользователя |
| 2026-08-19 | Раздачи: `blinds.ante_mode` `bb` (дефолт ввода) / `occupied`; анте 0; нет поля — легаси `table_size × ante` |
| 2026-08-19 | Запись раздачи: банк/вложение/профит всегда из движка |
| 2026-08-19 | Раздачи: BB в составе обязателен, SB опционален (dead button). Стартовый банк `(SB если есть) + BB + table_size × ante` |
| 2026-08-16 | `users.stack_display` (`chips` \| `bb`, default `chips`) — режим отображения стеков в реплеере |
| 2026-08-16 | Раздачи: SB/BB в составе необязательны; мёртвые блайнды и анте пустых мест входят в стартовый банк `table_size × ante + sb + bb` |
| 2026-08-13 | `hands` — JSON-документ раздачи (`data` jsonb), короткий `slug`, публичный реплеер `/hand/:slug` |
| 2026-08-13 | `result_events` — хронология результата в трекере (entry/reentry/note); `entries_count` выводится из money-событий; при finish live копируются активные `live_events` |
| 2026-08-12 | `live_sessions` / `live_events` + enum `live_session_status` / `live_event_type` — ведение текущего турнира (вход, ре-энтри, заметки → `results`) |
| 2026-07-31 | `parser_profiles` + `organizers.schedule_parser_id` / `structure_parser_id`; ручная привязка парсера к организатору; human-readable title |
| 2026-07-30 | `import_jobs.parser_requested` — явный выбор парсера редактором (`auto`/`ai_only`/имя); блокировка несовместимого типа файла |
| 2026-07-30 | `series.slug`, `events.slug` + таблица `slug_redirects`; канон URL `/series/{slug}`, `/events/{series.slug}-{event.slug}`; UUID → 301 |
| 2026-07-30 | `events.buyin_bounty`, `events.day_end_note` — PDF/полное расписание: ноклаут-часть (buyin=total) и «уровень в день» |
| 2026-07-29 | Auth split: `auth_tokens.user_id` nullable, `email`; enum + `register` / `account_lookup`; `password_hash` NULL = legacy OTP-only |
| 2026-07-28 | `organizers.logo_data` / `logo_content_type` — загружаемый логотип; публичная раздача `/api/v1/media/organizers/{id}/logo` |
| 2026-07-28 | `users.nickname`: UNIQUE exact → UNIQUE INDEX `uq_users_nickname_lower` ON `lower(nickname)`; разрешены латиница+кириллица (без точки) |
| 2026-07-28 | MVP1 поиск/уведомления: `pg_trgm` GIN на `series.name`, `organizers.name`, `venues.name/city`, `events.name`; `notification_queue.read_at` + индексы inbox/unread |
| 2026-07-28 | `users.timezone` — nullable IANA; NULL = авто-определение из браузера («время у вас») |
| 2026-07-28 | Документация: enum `import_kind` добавлен в раздел «Enum-типы»; уточнено имя UNIQUE-индекса `venues.slug` → `ix_venues_slug` (без миграции) |
| 2026-07-26 | `venues.slug` UNIQUE NOT NULL (админ-справочник, URL-идентификатор площадки) |
| 2026-07-26 | `import_jobs.file_timezone` — пояс времён в файле при publish; create-series в POST `/admin/import` |
| 2026-07-28 | Auth UX: пароль опционален (без смены схемы); сессия sliding 30д через cookie refresh |
| 2026-07-26 | Password auth: `users.password_hash`, `users.email_verified_at`; таблица `auth_tokens` + enum `auth_token_purpose` |
| 2026-07-21 | Email OTP auth: `users.email` UNIQUE NOT NULL (идентификатор), `users.phone` nullable; `otp_codes.phone` → `email`, индекс `(email, created_at)` |
| 2026-07-19 | Этап 8 parsers: `import_jobs.import_kind`; `blind_levels.structure_set_label` + unique `(event_id, structure_set_label, level_no)`; freeroll buy-in 0 разрешён |
| 2026-07-19 | Этап 8 foundation: `import_jobs` — BYTEA исходник (`file_data` + metadata), `initial_draft`, cost/correction counters; удалено `file_path` |
| 2026-07-19 | Этап 7: уточнена семантика `fx_rates.rate_rub` (RUB/unit, weekend lookback ≤7д); новых таблиц нет |
| 2026-07-19 | Этап 6: `notification_type.series_cancelled`; `notification_queue.change_log_id` FK + unique `(change_log_id, user_id, type)` |
| 2026-07-18 | Этап 5: `users.default_reminder_offsets`; `notification_queue.bookmark_id` + unique reminder index |
| 2026-07-18 | Этап 4: `otp_codes.request_ip_hash` + индекс для IP rate limit без plaintext IP |
| 2026-07-18 | Этап 1: уточнены timestamps изменяемых справочников `organizers` и `venues`; схема реализована первой Alembic-миграцией |
| 2026-07-18 | Первая версия схемы (по итогам проектной сессии) |
