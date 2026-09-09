# Расхождения UI с макетами `docs/design/`

Зафиксировано при рефакторинге (2026-07-28). Дизайн и код в рамках рефакторинга **не менялись** — только список для решения владельца.

| Макет | Код | Расхождение |
|---|---|---|
| `page_login.html` | `pages/LoginPage.tsx` | В макете только OTP. В коде по умолчанию вкладка «Пароль» и табы «Пароль» / «Код на email». Password auth появился позже макета |
| `page_profile.html` | `features/auth/ProfilePage.tsx` | В макете «Email · Привязать» — в коде нет. В коде есть «Оформление → Тема» и «Служебное → Админка» — в макете нет |
| `page_series.html` | `pages/SeriesPage.tsx` / `SeriesInfo` | В макете 4 метрики, включая «N в закладках»; в коде 3. Нужен публичный агрегат |
| `page_series.html`, `page_event.html` | `EventRow`, `EventHeader` | Бейдж «Перенесён с HH:MM» есть в макетах, в коде нет. Нужен `previous_start_time` в публичном API |
| `page_home.html` / `cards_compact.html` | `HomePage` / `SeriesCard` | Закрыто: компактные карточки + day-stats (`today_events_count`, `highlight`) |
| `page_home.html` | `seriesDisplay.ts` | В макете постер `poster--bpt`; во фронте только `rpt` / `eapt` / `default` |
| `page_bookmarks.html` | `BookmarksPage` | В коде `LoginBanner` для гостя и undo-удаление (`UndoToast`) — в макете нет |
| `page_tracker.html` | `TrackerPage` | В коде предупреждение FX, guest-экран и `/tracker/results/new`; в макете только sheet для залогиненного |
| `admin_dicts.html` | `/admin/venues`, `/admin/organizers` | Один макет на два справочника; в приложении два маршрута |

См. также задачи «Догнать макеты…» в `docs/TODO.md` этап 9 и `docs/refactor_plan.md` §D.4.
