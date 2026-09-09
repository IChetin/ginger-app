# План рефакторинга — инвентаризация

Отчёт по Этапу 1. Базовая линия: `docs/refactor_baseline.md`. Коммит на момент осмотра — `dc1e41a`.

**Ничего из перечисленного ещё не исправлено.** Документ — список находок для согласования.

Легенда риска: **низкий** — удаление/переименование без изменения поведения, ловится компилятором; **средний** — затрагивает живой код, нужна ручная сверка; **высокий** — меняет поведение или схему БД.

---

## A. Мёртвый код

### A.1. Фронт: файлы, недостижимые ни из прода, ни из тестов

Построен граф импортов от точек входа `src/main.tsx` и `src/sw.ts`. Прод достигает 180 из 205 не-тестовых модулей.

| Файл | Строк | Риск | Тесты |
|---|---|---|---|
| `frontend/src/features/schedule/components/SeriesDetailView.tsx` | 194 | низкий | нет |
| `frontend/src/features/tracker/components/TrackerFiltersForm.tsx` | 190 | низкий | нет |
| `frontend/src/components/ui/alert-dialog.tsx` | 160 | низкий | нет |
| `frontend/src/features/tracker/components/ResultsList.tsx` | 104 | низкий | нет |
| `frontend/src/features/tracker/components/ProfitChart.tsx` | 103 | низкий | нет |
| `frontend/src/components/ui/card.tsx` | 88 | низкий | нет |
| `frontend/src/components/ui/table.tsx` | 87 | низкий | нет |
| `frontend/src/features/bookmarks/components/NotificationHistoryList.tsx` | 65 | низкий | нет |
| `frontend/src/features/tracker/components/StatsCards.tsx` | 54 | низкий | нет |
| `frontend/src/components/ui/badge.tsx` | 49 | низкий | нет |
| `frontend/src/features/tracker/lib/format.ts` | 40 | низкий | нет |
| `frontend/src/components/ui/textarea.tsx` | 18 | низкий | нет |
| `frontend/src/features/schedule/components/CalendarView.tsx` | 1 | низкий | нет |
| `frontend/src/features/auth/LoginPage.tsx` | 1 | низкий | нет |

**Итого 14 файлов, 1 154 строки.** `src/vite-env.d.ts` формально недостижим, но это файл деклараций — трогать нельзя.

Два последних файла — однострочные реэкспорты, которые не импортирует уже никто: `CalendarView.tsx` целиком это `export { CalendarPage } from "@/pages/CalendarPage";`, `features/auth/LoginPage.tsx` — `export { LoginPage } from "@/pages/LoginPage";`. То есть это остатки того же слоя алиасов, что описан в B.6, но осиротевшие.

Примечание: 5 удаляемых `components/ui/*` — неиспользуемые shadcn-примитивы. Живые примитивы (`button`, `dialog`, `input`, `label`, `select`, `checkbox`, `skeleton`) остаются.

### A.2. Фронт: файлы, живые только благодаря собственным тестам

Прод их не импортирует — это предыдущее поколение UI (slate-палитра), заменённое экранами в `pages/*`. Тесты проходят и создают ложное ощущение покрытия.

| Файл | Строк | Тест | Риск |
|---|---|---|---|
| `frontend/src/features/schedule/components/EventDetailView.tsx` | 199 | `EventDetailView.test.tsx` | низкий |
| `frontend/src/features/schedule/components/ScheduleFiltersForm.tsx` | 194 | `ScheduleFiltersForm.test.tsx` | низкий |
| `frontend/src/features/bookmarks/components/BookmarkButton.tsx` | 152 | `BookmarkButton.test.tsx` | низкий |
| `frontend/src/features/schedule/components/SeriesFeed.tsx` | 110 | `SeriesFeed.test.tsx` | низкий |
| `frontend/src/features/bookmarks/components/BookmarkOverviewCard.tsx` | 84 | `BookmarkOverviewCard.test.tsx` | низкий |
| `frontend/src/features/schedule/lib/filters.ts` | 80 | `filters.test.ts` | низкий |
| `frontend/src/components/layout/AppHeader.tsx` | 79 | `AppHeader.test.tsx` | низкий |
| `frontend/src/features/schedule/components/SeriesCard.tsx` | 34 | `SeriesCard.test.tsx` | низкий |

**Итого 8 модулей (932 строки) + 8 тестовых файлов (526 строк).**

Требует вашего решения: удаление уменьшит счётчик vitest ровно на **15 тестов из 202** (останется 187) и на 8 файлов из 48. Формально «тестов стало меньше», фактически — перестанем тестировать то, чего нет в проде. Альтернатива — оставить как есть.

### A.3. Бэкенд: неиспользуемые функции

Проверено grep-ом по `backend`, `worker`, `scripts` — по одному вхождению (само определение).

| Символ | Файл:строка | Риск | Тесты |
|---|---|---|---|
| `list_flights_from_event()` | `backend/app/services/admin_schedule.py:1316` | низкий | нет |
| `load_series_with_venue()` | `backend/app/services/change_notifications.py:492` | низкий | нет |
| `ensure_series_empty()` | `backend/app/services/imports/validation.py:240` | низкий | нет |
| `assert_series_has_no_events()` | `backend/app/services/imports/jobs.py:315` | низкий | нет |
| `clear_parsers()` | `backend/app/services/imports/registry.py:19` | низкий | нет |
| `_today_utc()` | `backend/app/services/admin_dashboard.py:52` | низкий | нет |
| `request_dev_otp` (алиас) | `backend/app/services/auth.py:888` | низкий | нет |
| `verify_dev_otp` (алиас) | `backend/app/services/auth.py:889` | низкий | нет |

Неиспользуемых эндпоинтов и Pydantic-схем не найдено — весь `api/v1/router.py` подключён.

### A.4. Неиспользуемые токены темы

Объявлены в `frontend/src/index.css`, ноль вхождений в `.ts`/`.tsx`. При проверке на Этапе 2 выяснилось, что группы ведут себя по-разному.

**Удалено** — дефолтные переменные shadcn, которых нет в эталонном styleguide:

| Токен | Строки в `index.css` |
|---|---|
| `--chart-1` … `--chart-5` + маппинги `--color-chart-*` | 238–242, 287–291 |
| `--sidebar` и все `--sidebar-*` (9 штук) + маппинги `--color-sidebar-*` | 230–237, 293–300 |

**Оставлено** — это не мёртвый код, а дизайн-токены Day2, которые фронт просто не подключил:

| Токен | Где определён в эталоне |
|---|---|
| `--gold-grad-hover` | `docs/design/styleguide.html:34`, `styleguide_themes.html:19,44` |
| `--gold-grad-press` | `docs/design/styleguide.html:35`, `styleguide_themes.html:20,45` |
| `--gold-lo` | `docs/design/styleguide.html:31` («низ градиента») |

Следствие — **новая находка**: styleguide задаёт состояния основной кнопки `.btn--primary:hover` (`styleguide.html:100`) и `:active` (`styleguide.html:101`), но во фронте золотые кнопки не имеют ни hover-, ни press-состояния — токены объявлены и никуда не подключены. Внесено в `TODO.md`, этап 9.

### A.5. Неиспользуемая зависимость

| Пакет | Файл | Риск |
|---|---|---|
| `@fontsource-variable/geist` | `frontend/package.json:20` | низкий |

Ноль импортов. Шрифт проекта — Manrope, подключается через Google Fonts в `frontend/index.html:31`.

Проверены и **признаны нужными**: `shadcn` (импортируется как `shadcn/tailwind.css` в `index.css:3`), `httpx` в backend (`app/services/captcha.py`), `python-multipart` и `email-validator` (используются FastAPI/Pydantic неявно), `psycopg` в worker (`worker/config.py:32`).

### A.6. Прочее

| Находка | Файл | Риск |
|---|---|---|
| `adminKeys.me()` объявлен, но не используется (везде `authKeys.me()`) | `frontend/src/features/admin/queryKeys.ts:10` | низкий |

---

## B. Дубли

Правило отбора: выносим при **трёх и более** вхождениях. Пункты с двумя вхождениями помечены как «оставить» — они приведены только для полноты картины.

### B.1. Символы валют — 3 вхождения → выносить

| Файл:строка | Вид |
|---|---|
| `frontend/src/components/tracker/StatsGrid.tsx:4-9` | `const SYMBOLS: Record<string, string>` |
| `frontend/src/components/tracker/ProfitChart.tsx:13` | тот же литерал `{ RUB: "₽", BYN: "Br", EUR: "€", USD: "$" }` |
| `frontend/src/components/tracker/ResultsList.tsx:34` | инлайн-дубликат |

Риск средний (живой код трекера). Тесты: `ResultsList.test.tsx` покрывает третий случай.

### B.2. Подписи статусов серии — 4 живых вхождения → выносить

| Файл:строка | Значение для `schedule_published` |
|---|---|
| `frontend/src/components/admin/StatusBadge.tsx:14` | «Сетка опубликована» |
| `frontend/src/components/series/SeriesInfo.tsx:26` | «Сетка опубликована» |
| `frontend/src/pages/admin/AdminSeriesDetailPage.tsx:769` | «Сетка опубликована» |
| `frontend/src/pages/admin/AdminSeriesPage.tsx:397` | «Сетка опубликована» (`<option>`) |
| `frontend/src/features/schedule/lib/format.ts:54` | **«Расписание»** |

Расхождение в пятой строке приводит к разным подписям одного статуса в разных экранах — подробности в разделе «Найденные баги», пункт 1.

Риск средний. Тесты: частично (`seriesDisplay.test.ts`, `bookmarkDisplay.test.ts`).

### B.3. Ad-hoc форматирование чисел — 5+ вхождений → выносить

`new Intl.NumberFormat("ru-RU", …)` вместо общей утилиты:

| Файл:строка |
|---|
| `frontend/src/components/tracker/AddResultSheet.tsx:440` |
| `frontend/src/components/tracker/ProfitChart.tsx:62` |
| `frontend/src/components/tracker/ResultsList.tsx:31` |
| `frontend/src/components/tracker/StatsGrid.tsx:11-12` |
| `frontend/src/features/schedule/lib/format.ts:35` (`formatMoney`) |
| `frontend/src/features/admin/import/ImportReviewPage.tsx:84` (локальный `formatMoney`) |

Риск средний (влияет на отображение сумм). Тесты: `format.test.ts`, `ResultsList.test.tsx`.

### B.4. Два параллельных модуля работы со временем → требует решения

| Модуль | Строк | Потребителей | Что внутри |
|---|---|---|---|
| `frontend/src/lib/time.ts` | 243 | 10 | `getUserTimezone`, `parseIsoDateParts`, `formatDualTime`, `formatTimeInTimezone`, … |
| `frontend/src/features/schedule/lib/format.ts` | 95 | 17 | `getUserTimezone`, `parseIsoDate`, `formatFlightDateTime`, `formatDate`, … |

Пересекающаяся функциональность:

- `getUserTimezone()` — определена дважды идентично (`lib/time.ts:78`, `format.ts:62`);
- разбор ISO-даты — `parseIsoDateParts` (`lib/time.ts:28`) и приватный `parseIsoDate` (`format.ts:92`), причём **семантика разная**: первый строит дату в UTC, второй — в локальной зоне браузера;
- двойное время «площадка + пользователь» — `formatDualTime` (`lib/time.ts:126`) и `formatFlightDateTime` (`format.ts:66`), разные форматы вывода.

Формально это по 2 вхождения, то есть под правило «три и более» не подпадает. Но два модуля с одинаковым назначением и разной семантикой разбора даты — источник будущих ошибок. **Нужно ваше решение** (варианты в конце документа).

Риск объединения — средний. Тесты: `lib/time.test.ts`, `features/schedule/lib/format.test.ts` — оба есть.

### B.5. Трёхуровневый реэкспорт хуков ролей

Цепочка: `@/api/auth` (единственный источник, `api/auth.ts:60,75,79`) → `features/auth/hooks.ts` (чистый реэкспорт, 18 строк) → `features/admin/hooks.ts:52` (реэкспорт реэкспорта).

Следствие — разные экраны импортируют одно и то же из трёх разных мест:

| Импортирует из | Файлы |
|---|---|
| `@/api/auth` | `pages/LoginPage.tsx:8` |
| `@/features/auth/hooks` | `features/admin/AdminGuard.tsx:4`, `components/layout/AppHeader.tsx:4`, `features/auth/ProfilePage.tsx:16`, `features/auth/useIsStaff.ts:1` |
| `@/features/admin/hooks` | `features/admin/AdminRoleGuard.tsx:3`, `pages/admin/AdminLayout.tsx:6`, `AdminOrganizersPage.tsx:14`, `AdminVenuesPage.tsx:17`, `AdminDashboardPage.tsx:7`, `AdminChangeLogPage.tsx:8` |

Логика проверки роли **не дублируется** (функции одни и те же) — дублируются только пути импорта. Риск низкий, ловится компилятором. Тесты: `useIsStaff.test.ts`.

Серверные guard-проверки ролей (`backend/app/core/deps.py`) дублей не имеют — там одна зависимость на все admin-роуты.

### B.6. Слой файлов-алиасов в админке

Девять файлов по одной строке, единственное содержимое — переименовывающий реэкспорт из `pages/admin/*`:

`features/admin/{AdminHomePage,AdminLayout,EventDetailPage,OrganizersPage,SeriesDetailPage,SeriesListPage,UsersPage,VenuesPage,ChangeLogPage}.tsx`

Пример: `features/admin/AdminHomePage.tsx` целиком — `export { AdminDashboardPage as AdminHomePage } from "@/pages/admin/AdminDashboardPage";`.

Из-за этого один и тот же экран называется двумя именами (`AdminDashboardPage` / `AdminHomePage`). Риск низкий (правится импорт в `App.tsx:5-17`). Тестов нет.

### B.7. Дубли, которые исчезнут сами при удалении мёртвого кода

Не требуют отдельной работы — перечислены, чтобы не искать их дважды: `ProfitChart`, `ResultsList`, `StatsCards`/`StatsGrid`, `TrackerFilters`/`TrackerFiltersForm`, `SeriesCard`, `BookmarkButton`, `NotificationHistory`/`NotificationHistoryList`, `SeriesDetailView`/`SeriesPage`, `EventDetailView`/`EventPage`. Живая версия каждого — в `components/*` или `pages/*` (см. A.1 и A.2).

### B.8. Оставить как есть (два вхождения)

| Что | Где |
|---|---|
| Флаги стран `🇷🇺/🇧🇾/🇨🇾` | `components/series/seriesDisplay.ts:5-9`, `components/layout/FilterChips.tsx:12-17` |
| Обработка ошибок API | дублей нет — единственная точка `api/client.ts:93` (`parseError`) |
| Компоненты таблиц админки | дублей нет — общие `components/admin/AdminTable.tsx` + `AdminCardList.tsx`, используются всеми 5 списками |

---

## C. Хардкод

| Что | Файл:строка | Риск | Комментарий |
|---|---|---|---|
| Hex-цвета в Canvas share-card | `features/tracker/lib/shareCard.ts:52,62,71,79,108,109,113,117,128,130,132,135,147` | средний | Живой код. Canvas не умеет Tailwind-классы, но палитра **чужая** (slate/sky), а не Day2 |
| Hex-цвета в Recharts | `features/tracker/components/ProfitChart.tsx:65-93` | низкий | Мёртвый файл, уходит с A.1 |
| Hex в `THEME_COLORS` | `lib/theme.ts:16-17` | — | Оправдано: `<meta name="theme-color">` требует литерал. Оставить |
| Arbitrary-цвет `rgba(245,143,60,.35)` | `features/admin/import/ImportReviewPage.tsx:581` | средний | Похоже на `--warn`, но записан числом |
| Arbitrary-цвет `rgb(28_21_3_/_.65)` | `pages/admin/AdminDashboardPage.tsx:433` | средний | Похоже на `--text-on-gold` |
| Палитра `rose-500` / `amber-500` вместо токенов | `features/admin/import/ImportReviewPage.tsx:46,50` | средний | Живой экран импорта |
| Палитра `slate-*` в примитивах | `components/ui/{button,input,select,skeleton}.tsx` | средний | Живые примитивы; расходятся с токенами Day2 |
| URL капчи | `features/auth/components/SmartCaptcha.tsx:6` | низкий | Внешний скрипт Яндекса, менять некуда — оставить |
| URL поддержки | `features/auth/ProfilePage.tsx:28` | — | Уже через `VITE_TELEGRAM_SUPPORT_URL` с фолбэком. Оставить |

Отладочных остатков **не найдено**: ноль `console.*` и ноль `debugger` в `frontend/src` (кроме тестов), ноль `print()` в `backend/app` и `worker/worker` (два `print` в `scripts/*.py` — это вывод CLI, штатно), ноль закомментированных блоков кода.

---

## D. Расхождения с документацией

### D.1. Код против `ARCHITECTURE.md`

| Расхождение | Документ | Код |
|---|---|---|
| Структура фронта | §3: `frontend/src/{api,components,pages,hooks,lib}` | Есть ещё `src/features/` — 105 файлов, 10 126 строк. В документе не описан |
| Слой `features` vs `pages` | — | Экраны админки лежат в `pages/admin/*`, а `features/admin/*` — тонкие алиасы (B.6). Принцип «страницы тонкие, логика в `features/<domain>/`» из правил проекта соблюдается частично |

### D.2. Код против `db_schema.md`

| Расхождение | Риск |
|---|---|
| Enum `import_kind` (`schedule` \| `structures`) отсутствует в разделе «Enum-типы» (`db_schema.md:9-21`), хотя используется в таблице `import_jobs` (`db_schema.md:263`) и объявлен в `models/enums.py:94` | низкий, правка документа |
| Имя индекса на `venues.slug`: в БД `ix_venues_slug` (миграция `h4d0f2a59b83:89`), модель объявляет `unique=True` (`models/references.py:79`) — стандартное имя SQLAlchemy было бы `uq_venues_slug`. Функционально эквивалентно | низкий |

**Миграций не требуется.** Все индексы, описанные в `db_schema.md`, присутствуют в миграциях и моделях; колонок «в документе есть, в модели нет» и наоборот не обнаружено.

### D.3. Код против `TODO.md`

| Расхождение | Комментарий |
|---|---|
| Этап 9 «Публичные экраны» отмечен `[ ]` (`TODO.md:88`), а все четыре подпункта — `[x]` (89–92) | Родительский пункт не закрыт |
| Этап 9 «Закладки и трекер» `[ ]` (96), оба подпункта `[x]` (97–98) | То же |
| Этап 9 «Состояния» `[ ]` (99), все шесть подпунктов `[x]` (100–105) | То же |
| Этап 9 «Перенос во frontend» `[ ]` (108), все восемь подпунктов `[x]` (109–116) | То же |

### D.4. Расхождения с макетами `docs/design/` — только список, дизайн не трогаем

Актуальный список вынесен в **`docs/design_gaps.md`** (этап 7). Ниже — исходная инвентаризация.

Требуют вашего решения отдельно, кодом в рамках рефакторинга не правятся.

| Экран | Расхождение |
|---|---|
| `page_login.html` → `pages/LoginPage.tsx` | В макете только OTP-вход. В коде по умолчанию вкладка «Пароль» (`LoginPage.tsx:28-29`) и табы «Пароль»/«Код на email» (59–91) — табов в макете нет. Причина понятна: password auth появился позже макета (`ARCHITECTURE.md`, история за 2026-07-26) |
| `page_profile.html` → `features/auth/ProfilePage.tsx` | В макете есть строка «Email · Привязать» — в коде её нет. В коде есть группы «Оформление → Тема» (`SettingsList.tsx:154-166`) и «Служебное → Админка» (102–115) — их нет в макете |
| `page_series.html` → `pages/SeriesPage.tsx` | В макете 4 метрики, включая «N в закладках»; в коде 3 (`SeriesInfo.tsx:87-103`, четвёртая под TODO на строке 102) |
| `page_series.html`, `page_event.html` | Бейдж «Перенесён с HH:MM» есть в макетах, в коде — TODO (`EventRow.tsx:97`, `EventHeader.tsx:107`). Нужен `previous_start_time` в публичном API |
| `page_home.html` → `pages/HomePage.tsx` | В макете у идущей серии «Идёт · день 3 из 11» и «Сегодня 4 турнира · Main Event 8 авг»; в коде только «Идёт» (`SeriesCard.tsx:43-46`, TODO в `seriesDisplay.ts:113`). Нужны day-stats в API |
| `page_home.html` | В макете постер `poster--bpt`; во фронте только `rpt`/`eapt`/`default` (`seriesDisplay.ts:55-63`) |
| `page_bookmarks.html` | В коде есть `LoginBanner` для гостя и undo-удаление (`UndoToast`) — в макете нет |
| `page_tracker.html` | В коде есть предупреждение о курсе FX (`TrackerPage.tsx:156-159`), guest-экран и отдельная страница `/tracker/results/new` — в макете только sheet для залогиненного |
| `admin_dicts.html` | Один макет на два справочника; в приложении два отдельных маршрута `/admin/venues` и `/admin/organizers` (`App.tsx:64-65`) |

---

## E. Типизация

### E.1. Фронт — состояние хорошее

- `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` включены (`tsconfig.app.json`).
- Единственный `any` во всём `src` — `test/setup.ts:49`, полифилл PointerEvent, с обоснованием в комментарии на строке 48.
- Ноль `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`.

**Находка:** `frontend/e2e/**` (9 файлов, 617 строк) не входит ни в `tsconfig.app.json` (`include: ["src"]`), ни в `tsconfig.node.json` (`include: ["vite.config.ts", "eslint.config.js"]`). То есть `npm run build` E2E-спеки **не типизирует** — они проверяются только ESLint-ом. Риск низкий; включение может выявить скрытые ошибки типов.

### E.2. Бэкенд — 15 ошибок mypy

Перечислены в `refactor_baseline.md`. Все — предсуществующие; по условию задачи в рефакторинге не чиним, но они блокируют CI.

### E.3. Pydantic-схемы против SQLAlchemy-моделей

Сверка расхождений **не выявила**. Разница между схемами и моделями всюду намеренная:

- вычисляемые поля DTO: `UserMe.email_verified` / `has_password` (`schemas/auth.py:168-169`, считаются в `services/auth.py:882-883`), `AdminUserRead.is_superadmin`, `VenueRead.series_count`, `SeriesAdminRead.events_count` / `bookmarks_count`, `ResultListItem.profit_base` / `base_currency`;
- намеренно скрытые поля модели: `Result.my_share_pct` (в MVP скрыт, см. `ARCHITECTURE.md` §5.4), `Result.user_id` (исключается в `services/results.py:108`), `User.password_hash`, `ImportJob.file_data` (API не отдаёт blob — соответствует §5.3);
- поля, опциональные в схеме и NOT NULL в модели, но заполняемые сервисом: `ResultCreate.name/played_on/buyin/currency_code` (валидация в `services/results.py:225-235`), `RegisterBody.nickname` (генерация в сервисе), `Result.entry_type` (всегда `EntryType.LIVE_MTT`, `results.py:206`).

Типы денег корректны везде: `Numeric` в моделях, `Decimal` + `field_serializer` в схемах. **Ни одного `float()` в `backend/app` и `worker/worker`.**

---

## F. Потенциальные N+1 и запросы без индексов

Найдено по коду, без профилирования. Ленивых обращений к relationship в горячих путях нет — в `services/schedule.py`, `stats.py`, `bookmarks.py`, `admin_dashboard.py`, `results.py` везде стоит `selectinload`. Проблема в другом: **запросы внутри циклов**.

| Файл:строки | Что происходит | Путь | Риск правки |
|---|---|---|---|
| `services/imports/publish.py:252-259` | `await session.get(Currency, …)` на каждое событие черновика | `POST /admin/import/{job_id}/publish` | средний |
| `services/imports/publish.py:401-428` | вложенный цикл: `delete` + `select(BlindLevel)` на каждый event | тот же, ветка structures | средний |
| `services/change_notifications.py:418-425` | `await session.scalar(…)` — проверка дубликата на каждого получателя | fan-out при правке расписания | средний |
| `services/change_notifications.py:464-467` | `resolve_target_user_ids(…)` на каждое запланированное уведомление | preview/update | средний |
| `services/notification_previews.py:54-55` | то же, в предпросмотре | `POST .../preview` | средний |
| `services/notifications.py:137-138` | `schedule_flight_reminders` в цикле, каждый вызов делает свой `select(Flight)` (строки 75–81) | replace flights в админке | средний |
| `services/notifications.py:269-270` | `schedule_series_starting` в цикле, каждый — свой `select(Series)` (216–217) | update series | средний |
| `services/bookmarks.py:399-437` | на каждый элемент: `scalar` + `_ensure_target_exists` + `flush` | `POST /bookmarks/migrate` | средний |

Все восемь — админские/пакетные операции, не пользовательское чтение. Ни один не на горячем пути ленты или карточки турнира.

### Запросы по неиндексированным колонкам

| Файл:строки | Колонка | Комментарий |
|---|---|---|
| `services/bookmarks.py:40-41` | `Bookmark.user_id` | Есть UNIQUE `(user_id, target_type, target_id)` — префикс покрывает фильтр |
| `services/admin_change_log.py:166-167`, `results.py:148`, `admin_schedule.py:517`, `admin_references.py:278` | `*.name ILIKE` | Индексов на `name` нет; `pg_trgm` не подключён |
| `services/notifications.py:337-345` | `(user_id, status, sent_at)` | Составного индекса нет |
| `services/admin_dashboard.py:213-219,278-285` | `(status, created_at)`, `(status, sent_at)` | Есть только `(status, scheduled_at)` |
| `services/schedule.py:569` | `Event.tags` | Полный скан, GIN нет |

**Ни один из этих индексов не описан в `db_schema.md`**, поэтому по условию задачи (индексы добавляем только если они есть в документе, но отсутствуют в миграциях) добавлять их в рамках рефакторинга не нужно. Выношу как отдельные задачи в `TODO.md`.

---

## G. TODO / FIXME в коде

Ни одного `FIXME`, `HACK` или `XXX`. Девять `TODO`:

| Файл:строка | Текст | Предложение |
|---|---|---|
| `pages/PrivacyPage.tsx:4,20` | заглушка политики конфиденциальности | Уже есть в `TODO.md` этап 11 — оставить, привязать к задаче |
| `components/series/seriesDisplay.ts:113` | day-stats для идущей серии | В `TODO.md` (нужно поле в API) |
| `components/series/SeriesInfo.tsx:102` | счётчик закладок, когда появится публичный агрегат | В `TODO.md` |
| `components/series/EventRow.tsx:97` | бейдж «Перенесён с HH:MM» | В `TODO.md` |
| `components/event/EventHeader.tsx:107` | то же (дубль предыдущего) | В `TODO.md`, одной задачей |
| `components/event/VenueCard.tsx:19` | открывать карты, когда выберем стратегию deep-link | В `TODO.md` |
| `components/profile/ProfileHeader.tsx:25` | смена email с повторной верификацией (фаза 3+) | Оставить: относится к фазе 3 |

Все семь уникальных TODO осмысленны и относятся к нереализованной функциональности — удалять нечего, надо перенести в `TODO.md`.
Отдельно: `pages/LoginPage.test.tsx:300` проверяет наличие текста «TODO» на странице политики — при правке `PrivacyPage` тест сломается.

---

## H. Найденные баги — НЕ ИСПРАВЛЯЮ, нужно ваше решение

### 1. Разные подписи одного статуса серии

`formatSeriesStatus()` (`features/schedule/lib/format.ts:54`) возвращает для `schedule_published` строку **«Расписание»**, тогда как остальные четыре места в приложении показывают **«Сетка опубликована»** (см. B.2).

Функция живая: используется в `features/bookmarks/lib/bookmarkDisplay.ts:200`, который формирует подзаголовок карточки серии на экране `/bookmarks`. То есть на закладках статус называется иначе, чем на самой серии и в админке.

Влияние: косметическое, но заметное пользователю. Тест `bookmarkDisplay.test.ts` фиксирует текущее поведение — при исправлении его надо будет обновить.

### 2. Нестабильный E2E-тест регистрации

`frontend/e2e/registration.spec.ts:34` — в одном из двух прогонов не дождался мигрировавшей гостевой закладки за 20 с (детали в `refactor_baseline.md`). Проходит с ретрая. Возможна реальная гонка в миграции гостевых закладок после логина (`useMigrateGuestBookmarks`), а не только медленный тест. Требует отдельного разбора.

### 3. CI на `main` красный

~~Четыре обязательных шага CI падают…~~ **Исправлено 2026-07-28**: mypy (этап 5), ruff + prettier (chore перед этапом 6).

### 4. Share-card трекера в чужой палитре

`features/tracker/lib/shareCard.ts` рисует картинку для шеринга в палитре slate/sky (тёмно-синий + голубой), а не в фирменных чёрно-золотых цветах Day2. Функция живая — картинка уходит наружу через Web Share. По `TODO.md:106` пункт «Share-card трекера (визуал для экспорта графика)» ещё не закрыт, так что это скорее незавершённая работа, чем баг. Дизайна для неё в `docs/design/` нет.

### 5. Внешний запрос к Google Fonts

`frontend/index.html:31` подключает Manrope с `fonts.googleapis.com`. Для продукта под 152-ФЗ с прицелом на РФ это внешний запрос с IP пользователя на зарубежный сервер. `ARCHITECTURE.md` §6 требует «без внешних трекеров» только для писем, про фронт прямо не сказано. Локальные шрифты в проекте уже есть в зависимостях (`@fontsource-variable/geist`), но это Geist, а не Manrope. Отмечаю как риск, решение за вами.

---

## I. Принятые решения (согласовано с владельцем 2026-07-26)

| # | Вопрос | Решение |
|---|---|---|
| 1 | Мёртвый код с тестами (A.2) | **Удалить** 8 модулей вместе с 8 тестовыми файлами. vitest: 202 → 187 тестов, 48 → 40 файлов |
| 2 | Два модуля времени (B.4) | Свести в одну точку **только `getUserTimezone`**. Остальное (`parseIsoDate`/`parseIsoDateParts`, `formatDualTime`/`formatFlightDateTime`) не трогать |
| 3 | Слой алиасов админки (B.6) | **Убрать** девять однострочных файлов, импорты в `App.tsx` править на `pages/admin/*` |
| 4 | Примитивы `components/ui/*` на slate (C) | **Не трогать** — это визуальное изменение. Вынести задачей в `TODO.md` |
| 5 | Баг №1 (подпись статуса) | **Не исправлять** в рефакторинге. Вынести задачей в `TODO.md`. При выносе подписей статусов в один модуль (B.2) текущее расхождение сохраняется как есть |
| 6 | Ре-экспорты auth-хуков (B.5) | **Не трогать**: дублей логики нет, риск не окупается. Вынесено задачей в `TODO.md` |

Следствие для критерия «ни одного hex вне токенов»: по решению №4 он **не достигается полностью** — палитра slate/rose/sky в `components/ui/*` и части `features/*` остаётся (задача в `TODO.md`). Arbitrary `rgba`/`rgb` и `rose-500`/`amber-500` в импорте/дашборде на Этапе 4 заменены на токены. Hex в `shareCard.ts` — известный баг H.4, не чиним. `lib/theme.ts` hex оправдан (`theme-color` meta).

---

## K. Этап 4 — консистентность (сделано 2026-07-27)

| Пункт | Результат |
|---|---|
| Ошибки API `{error:{code,message}}` | Уже едино: `main.py` handlers + `api/client.ts` `parseError`. Дублей нет |
| Именование | Отклонений после B.6 нет. `components/ui/*.tsx` lowercase — соглашение shadcn, оставляем |
| Цвета → токены | `ImportReviewPage` / `StructureImportReview` / `AdminDashboardPage`: rose/amber/arbitrary → `danger`/`warn`/`ink-ongold`. Остальное slate → `TODO.md` |
| Парсинг дат | `seriesDisplay`, `calendarDisplay`, `ResultsList` → `parseIsoDateParts`. `format.ts` `parseIsoDate` не трогали (решение №2). `AdminChangeLogPage` — локальные «сегодня/вчера» браузера, семантика другая |
| Деньги | Backend: `Decimal`/`Numeric`, float нет. Frontend: `Number()` только для отображения (`@/lib/money`), в API уходят строки |
| Инварианты | UTC `DateTime(timezone=True)` везде; напоминания на flight; `results_visibility` default `private`; импорт: template parser → AI fallback |

---

## L. Этап 5 — типы и валидация (сделано 2026-07-27)

| Пункт | Результат |
|---|---|
| Backend mypy | **0 ошибок** (было 15). TypedDict для сидов; переименованы переменные циклов (`Series`/`Event`/`parser`); аннотация `_stale_series_clause`; `ZoneInfo("UTC")` вместо `UTC` в `tz` |
| Frontend `any` | Без изменений: один обоснованный `any` в `test/setup.ts` (PointerEvent polyfill) |
| E2E типизация | Добавлен `tsconfig.e2e.json`, подключён в `tsc -b`. Скрытых ошибок типов не нашлось |
| Pydantic ↔ SQLAlchemy | Расхождений нет (как в §E.3): вычисляемые/скрытые поля намеренные |

---

## M. Этап 6 — производительность (сделано 2026-07-28)

| Пункт | Результат |
|---|---|
| N+1 publish currencies | Один `IN`-запрос вместо `get` на каждое событие |
| N+1 publish structures | Убран повторный `select(BlindLevel)` — снимок из только что добавленных объектов |
| N+1 enqueue notifications | Одна проверка существующих `(change_log, type, users)` вместо scalar в цикле |
| N+1 resolve targets | Кэш `TargetSelector` в `enqueue_planned_notifications` и `impacts_from_planned` |
| N+1 reschedule reminders | Flight/Series грузятся один раз и передаются в schedule_* |
| N+1 migrate bookmarks | Preload существующих закладок + batch-проверка целей |
| Индексы | В `db_schema.md` отсутствующих нет → миграций нет; кандидаты в `TODO.md` |
| Фронт query keys / useMe | Дублей ключей нет; `useMe` шарит кэш TanStack Query — лишних запросов нет |

CI-линтеры (ruff/prettier/mypy) починены отдельным коммитом перед этапом 6.

---

## N. Этап 7 — документация (сделано 2026-07-28)

| Документ | Что сделано |
|---|---|
| `ARCHITECTURE.md` §3 | Описан слой `features/` и роль `pages/` vs `features/`; запись в истории |
| `db_schema.md` | Enum `import_kind` в «Enum-типы»; уточнено имя UNIQUE `venues.slug` → `ix_venues_slug`; запись в истории |
| `TODO.md` | Закрыты родительские пункты этапа 9 (публичные экраны / закладки+трекер / состояния / перенос); ссылка на `design_gaps.md` |
| `design_gaps.md` | Новый файл: расхождения кода с макетами (дизайн не трогали) |

---

## J. Метрики «после»

Зафиксировано на Этапе 8 (2026-07-28), коммит до отчёта: `0a7b1b4` + compose-fix.

| Метрика | До | После | Вердикт |
|---|---|---|---|
| backend pytest | 191 passed / 166 с | **191 passed / 232 с** | не хуже |
| worker pytest | 11 passed / 1.5 с | **11 passed / 1.0 с** | не хуже |
| vitest | 202 → план 187 / 76 с | **187 passed (40 файлов) / 130 с** | не хуже (по решению №1) |
| Playwright | 6 / 15–38 с (1 flaky) | **6 (5 passed + 1 flaky) / 42 с** | не хуже |
| `index-*.js` | 1 326.64 kB (gzip 383.29) | **1 325.68 kB (gzip 383.51)** | не хуже |
| `index-*.css` | 82.02 kB (gzip 15.05) | **68.28 kB (gzip 12.93)** | лучше |
| PWA precache | 1 384.72 KiB | **1 370.37 KiB** | лучше |
| `frontend/src` файлов / строк | 253 / 31 013 | **217 / 28 384** | −36 файлов |
| `backend/app` файлов / строк | 116 / 16 828 | **118 / 17 038** | +2 (TypedDict/утилиты) |
| ruff / mypy / prettier | все красные | **все зелёные** | лучше |

Линтеры (этап 8): `ruff check` 0, `ruff format --check` 0, `mypy app` 0, `prettier --check` 0, `tsc -b` 0.

---

## O. Этап 8 — финальная проверка (2026-07-28)

### Тесты vs baseline

Все наборы **не хуже** базовой линии. Flaky `registration.spec.ts` остался flaky (как в baseline) — не чинили.

### Дев-контур

- `docker compose --profile test down -v && docker compose --profile test up -d` — поднимается с нуля, health green.
- **Починка по ходу проверки:** `db-init` не монтировал `docs/rasp_samples` → `FileNotFoundError` при сиде. В `docker-compose.yml` добавлен volume `./docs:/docs:ro`.
- **Оговорка:** повторный `db-init` на БД с пользовательскими `results`, ссылающимися на demo-events, падает на FK. С нуля (`down -v`) — ок; на грязной БД — `SEED_DEMO_DATA=false` или чистить results.

### Смоук ключевых путей (API, своими руками через скрипт)

| Путь | Результат |
|---|---|
| Вход | OK |
| Закладка на future flight | OK |
| Напоминание в `notification_queue` (pending) | OK |
| Добавление результата | OK |
| Импорт файла (upload → status=review, parse_path=code) | OK |
| Правка турнира (preview+confirm переноса флайта) | OK |

Публичные `GET /api/v1/health`, `/`, `/login`, `/admin`, лента серий — HTTP 200.

### Итоговый отчёт

**Сделано (этапы 0–8)**  
Мёртвый код удалён; дедуп валют/чисел/статусов/склонений/таймзоны/алиасов админки; консистентность цветов-токенов и парсинга дат; mypy/ruff/prettier зелёные; e2e в `tsc -b`; очевидные N+1 в пакетных путях; документация синхронизирована; `design_gaps.md`.

**Найдено и не тронуто** (см. `TODO.md` «Технический долг» + `design_gaps.md`)  
B.5 ре-экспорты auth; slate-палитра в ui/features; баг подписи «Расписание» vs «Сетка опубликована»; share-card чужая палитра; Google Fonts; индексы вне `db_schema.md`; расхождения с макетами.

**Баги / риски (без исправлений в рефакторинге, кроме compose volume)**  
1. Flaky E2E registration (миграция guest bookmarks).  
2. ~~db-init без `/docs`~~ — исправлено volume-ом на этапе 8.  
3. Re-seed demo на БД с `results` → FK error (оговорка к `up -d` без `-v`).  
4. CI ранее был красный по линтерам — исправлено на этапах 5–6.

### Критерии готовности

- [x] Тесты не хуже baseline  
- [x] Поведение не менялось (E2E + смоук путей)  
- [x] Мёртвый код убран; бандл не вырос  
- [x] Дубли из плана сняты или обоснованно оставлены  
- [~] Hex вне токенов — не полностью (shareCard / theme / решение №4)  
- [x] Документы синхронизированы  
- [x] Список багов передан отдельно, молча не чинили (кроме compose mount, без которого критерий «с нуля» блокировался)
