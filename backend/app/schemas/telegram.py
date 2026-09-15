from datetime import datetime

from pydantic import BaseModel


class TelegramStatus(BaseModel):
    """Состояние Telegram в профиле: доступен ли бот и подключён ли чат."""

    available: bool
    linked: bool
    username: str | None
    bot_username: str | None


class TelegramLinkStart(BaseModel):
    """Одноразовая ссылка на бота: t.me/<бот>?start=<токен>, живёт 15 минут."""

    url: str
    expires_at: datetime
