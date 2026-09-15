# Боевой стенд Ginger APP

Один VPS: is\*hosting, Стамбул, 2 vCPU / 2 ГБ / 30 ГБ NVMe, Ubuntu 24.04. Домен `lisa52.com`.

```
Интернет ─► Caddy :443 (HTTPS, Let's Encrypt)
              ├─ /api/*  ─► backend (FastAPI) ─► postgres
              └─ /*      ─► frontend-dist (готовая сборка PWA)
            worker ─► очередь уведомлений ─► Web Push
```

Наружу открыты только 22 (SSH по ключу), 80 и 443. База и бэкенд — внутри сети Docker.

## Доступ

Ключ `~/.ssh/ginger_hostkey`, алиасы в `~/.ssh/config`:

| Алиас | Кто | Когда |
|---|---|---|
| `ginger-root` | root | Только первичная настройка; после неё вход root закрыт |
| `ginger` | пользователь ginger (sudo, docker) | Всё остальное |

## Первый запуск (один раз)

1. **Сервер.** `ssh ginger-root 'bash -s' < deploy/bootstrap-server.sh`, затем проверить `ssh ginger 'docker version'`.
2. **DNS** у регистратора: `A lisa52.com → IP`, `A www.lisa52.com → IP`. Проверка: `nslookup lisa52.com`.
3. **Код.** `bash deploy/deploy.sh` — первый раз упадёт на проверке здоровья: нет `.env`. Это нормально.
4. **Секреты.** `ssh ginger 'cd /opt/ginger/app && bash deploy/gen-secrets.sh lisa52.com <email админа>'`.
5. **Почта.** Владелец аккаунта Brevo сам вписывает `SMTP_USER` и `SMTP_PASSWORD` в `/opt/ginger/app/.env` (секреты в чат не пересылаются).
6. **Запуск.** `bash deploy/deploy.sh` ещё раз — Caddy получит сертификат, бэкенд проверит настройки.
7. **Админ.** `ssh ginger 'cd /opt/ginger/app && docker compose -f docker-compose.prod.yml run --rm backend python -m app.seeds.create_admin <email> <ник>'`.
8. **Бэкап.** `ssh ginger 'crontab -l 2>/dev/null; echo "15 3 * * * bash /opt/ginger/app/deploy/backup.sh >> /opt/ginger/backups/backup.log 2>&1"' | ssh ginger crontab -`.
   Проверка восстановления с Google Drive — раз в неделю: `45 4 * * 1 bash /opt/ginger/app/deploy/backup-verify.sh >> /opt/ginger/backups/backup.log 2>&1` (там же, в crontab). Нужен `sudo apt-get install -y rclone`.

## Обычный деплой

```bash
bash deploy/deploy.sh
```

Выкатывается HEAD: незакоммиченные правки не уезжают, скрипт при них останавливается. Фронт
собирается локально в dev-контейнере (на сервере мало памяти), бэкенд и воркер — на сервере.
Миграции применяет `db-init` при каждом запуске.

## Защита от ошибок конфигурации

С `APP_ENV=production` бэкенд **не стартует**, если: секреты подписи по умолчанию, cookie без
`Secure`, `localhost` в CORS, адрес фронта не https, пароль базы из примера. Тестовый код входа
`123456` и тестовые пользователи в production не работают, заглушка капчи отказывает.

## Когда что-то сломалось

| Симптом | Где смотреть |
|---|---|
| Сайт не открывается | `ssh ginger 'cd /opt/ginger/app && docker compose -f docker-compose.prod.yml ps'` |
| Ошибка бэкенда | `... logs --tail=100 backend` |
| Нет сертификата | `... logs caddy` — DNS должен указывать на сервер, порт 80 открыт |
| Не приходят коды | `... logs backend | grep -i smtp`, статистика в Brevo |
| Не приходят пуши | `... logs worker`, `VAPID_*` в `.env` |

Бэкапы: `/opt/ginger/backups` (база — `pg_dump` custom, вложения — tgz), 14 дней. Восстановление
базы: `docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U ginger -d ginger --clean < db-….dump`.
Копия за пределы сервера — Google Drive, папка `ginger-backups`, 30 дней (`backup.sh` после
локального бэкапа). rclone видит только свои файлы (scope `drive.file`). Токен Google — файл
`/opt/ginger/secrets/rclone-drive-token.json`, не в `.env`: JSON с кавычками ломает разбор `.env`.
Получить токен (на своём ПК, rclone с rclone.org/downloads):
`rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"` → войти в Google → скопировать JSON
`{...}` из консоли → `(Get-Clipboard -Raw).Trim() | ssh ginger "umask 077; cat > /opt/ginger/secrets/rclone-drive-token.json"`.
Проверка восстановления — `backup-verify.sh` по понедельникам: свежий дамп с Drive
восстанавливается во временный Postgres, результат — в `backup.log`.
