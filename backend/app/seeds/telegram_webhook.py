"""Подключить вебхук Telegram-бота уведомлений — один раз после того, как задан токен.

    ssh ginger 'cd /opt/ginger/app && docker compose -f docker-compose.prod.yml exec -T \
        backend python -m app.seeds.telegram_webhook'
"""

from __future__ import annotations

import asyncio

from app.core.config import get_settings
from app.services.telegram import bot_api, is_configured, webhook_secret


async def run() -> None:
    settings = get_settings()
    if not is_configured(settings):
        raise SystemExit("Не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME")
    url = f"{settings.frontend_base_url.rstrip('/')}/api/v1/telegram/webhook"
    webhook = await bot_api(
        "setWebhook",
        {
            "url": url,
            "secret_token": webhook_secret(settings),
            "allowed_updates": ["message"],
            "drop_pending_updates": True,
        },
    )
    await bot_api(
        "setMyCommands",
        {"commands": [{"command": "stop", "description": "Отключить уведомления"}]},
    )
    print(f"Вебхук {url}: {'подключён' if webhook else 'ошибка — смотрите логи бэкенда'}")


if __name__ == "__main__":
    asyncio.run(run())
