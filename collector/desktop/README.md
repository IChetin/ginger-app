# Сборщик лобби на десктопе (X-Poker, PPPoker)

Официальные ПК-клиенты + PowerShell + встроенный OCR Windows. Турниры из лобби уходят в приёмник
`POST /api/v1/collector/...` на проде; сверка с сеткой и очередь решений — в админке «Сборщик».

| Файл | Что делает |
|---|---|
| `Desk.ps1` | снимок одного окна, клик/перетаскивание (сообщениями или курсором) |
| `Ocr.ps1` | Windows.Media.Ocr: слова и строки с координатами (en-US, ru) |
| `XPoker.ps1` | `Invoke-XPokerMttPass` — карточки турниров Ginger+ (клики сообщениями, курсор не нужен) |
| `PPoker.ps1` | `Invoke-PPokerMttPass` — лента MTT Ginger (листается только курсором) |
| `Send.ps1` | `Send-CollectorSnapshot` — сухой прогон или `-Apply` |
| `Run-Morning.ps1` | утренний сценарий для Планировщика: X-Poker + отправка, PPPoker без отправки |

## Резервный ПК — чек-лист

1. **Питание и сон.** В BIOS — включение после пропадания питания (Restore on AC Power Loss = On).
   В Windows — «никогда не спать», экран можно гасить, **блокировку экрана не включать**
   (клиенты рисуются только в открытой сессии).
2. **Автовход** в учётку, под которой открыты клиенты (netplwiz или Sysinternals Autologon).
3. **Экран:** масштаб 100%, одно разрешение всегда (координаты сборщика — от окон клиентов).
4. **Языки распознавания:** Параметры → Язык — русский и английский (проверка:
   `[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]::AvailableRecognizerLanguages`).
5. **Клиенты:** X-Poker и PPPoker для ПК, вход аккаунтом-сборщиком, вступление в Ginger+ и Ginger,
   автообновление клиентов выключить. Оставить открытыми: X-Poker — лобби клуба GINGER+ 2022497,
   вкладка MTT; PPPoker — лобби клуба Ginger, вкладка MTT. Окна не сворачивать.
6. **Код:** `git clone` репозитория (или копия папки `collector\desktop`).
7. **Токен сборщика** (тот же, что на сервере) — в файл профиля, не в репозиторий:
   `%USERPROFILE%\.ginger\collector_token`.
7а. **Токен** — не привязан к ПК: это общий пароль сборщика и сервера. Проще всего сгенерировать его
   сразу на резервном ПК командой из раздела «Токен» ниже — она кладёт файл и записывает токен на сервер.
8. **Планировщик заданий:** задача «Ginger collector», **ежедневно 10:00 и 22:00** (два триггера),
   «Выполнять только для вошедшего пользователя» (нужна открытая сессия с окнами), действие:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <путь>\collector\desktop\Run-Morning.ps1`.
9. **Проверка:** запустить `Run-Morning.ps1 -NoSend` руками, посмотреть лог в
   `%LOCALAPPDATA%\GingerCollector\<дата>\`.

Пока PPPoker листается, мышь занята — на резервном ПК это не мешает.

## Токен сборщика

Общий пароль между сборщиком и приёмником на сервере (`COLLECTOR_TOKEN` в `.env` прода). Не привязан к
компьютеру: где лежит файл токена — оттуда и можно отправлять. Генерирует и ставит владелец, одной
командой в PowerShell (значение не печатается; серверный скрипт перезапускает бэкенд, ~10 с):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $t = [Convert]::ToBase64String($b) -replace '[+/=]', ''; New-Item -ItemType Directory -Force "$env:USERPROFILE\.ginger" | Out-Null; [IO.File]::WriteAllText("$env:USERPROFILE\.ginger\collector_token", $t); $t | ssh ginger bash /opt/ginger/app/deploy/set-env-secret.sh COLLECTOR_TOKEN; Remove-Variable t, b
```

Нужен ssh-доступ `ginger` с этого ПК. Если его нет — сгенерировать на основном ПК и перенести файл
`%USERPROFILE%\.ginger\collector_token` на резервный. Новый токен отменяет старый.
