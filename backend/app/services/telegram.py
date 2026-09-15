"""Telegram-бот уведомлений (решение Ивана 15.09).

Основной канал — пуши приложения: весь смысл Ginger APP в независимости от Telegram. Бот —
второй канал. Игрок подключает его из профиля по одноразовой ссылке; дальше бот только пишет:
статусы заявок, ответы менеджера, колокольчики турниров, рассылки. Настроек нет: подключил —
важное приходит в оба канала. Сами уведомления отправляет воркер из общей очереди; здесь —
привязка чата и ответы бота на команды.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.telegram import TelegramLink
from app.schemas.telegram import TelegramLinkStart, TelegramStatus

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"
LINK_TTL = timedelta(minutes=15)

TEXT_LINKED = (
    "Готово! Сюда будут приходить важные уведомления Ginger: заявки на фишки, ответы "
    "менеджера, напоминания о турнирах и новости клуба.\n\n"
    "Отключить — /stop или в профиле приложения."
)
TEXT_EXPIRED = (
    "Ссылка устарела. Откройте Ginger → Профиль → «Подключить Telegram» и нажмите ещё раз."
)
TEXT_HOW_TO_LINK = (
    "Это бот уведомлений Ginger. Чтобы подключить, откройте приложение → Профиль → "
    "«Подключить Telegram»."
)
TEXT_STOPPED = "Уведомления Ginger отключены. Подключить снова — в профиле приложения."
TEXT_NOT_LINKED = "Уведомления и так не подключены."
TEXT_HELP = (
    "Я только присылаю уведомления Ginger — заявки и диалоги живут в приложении. "
    "Отключить уведомления — /stop."
)


def is_configured(settings: Settings) -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_bot_username)


def webhook_secret(settings: Settings) -> str:
    """Секрет вебхука выводится из токена бота — второго секрета в .env не нужно."""
    return hmac.new(
        settings.telegram_bot_token.encode(), b"ginger-telegram-webhook", hashlib.sha256
    ).hexdigest()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def bot_api(
    method: str, payload: dict[str, Any], settings: Settings | None = None
) -> dict[str, Any] | None:
    """Вызов Bot API. Ошибки не роняют запрос: ответ бота — не главное действие."""
    settings = settings or get_settings()
    if not settings.telegram_bot_token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{API_BASE}/bot{settings.telegram_bot_token}/{method}", json=payload
            )
        data: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError):
        logger.warning("telegram %s failed", method)
        return None
    if not data.get("ok"):
        logger.warning("telegram %s error: %s", method, data.get("description"))
        return None
    return data


async def status(session: AsyncSession, user: User) -> TelegramStatus:
    settings = get_settings()
    link = await session.get(TelegramLink, user.id)
    linked = link is not None and link.chat_id is not None
    return TelegramStatus(
        available=is_configured(settings),
        linked=linked,
        username=link.username if link is not None and linked else None,
        bot_username=settings.telegram_bot_username or None,
    )


async def start_link(
    session: AsyncSession, user: User, *, now: datetime | None = None
) -> TelegramLinkStart:
    settings = get_settings()
    if not is_configured(settings):
        raise AppError("telegram_unavailable", "Telegram-бот пока не подключён", 503)
    moment = now or datetime.now(UTC)
    token = secrets.token_urlsafe(24)
    link = await session.get(TelegramLink, user.id)
    if link is None:
        link = TelegramLink(user_id=user.id, created_at=moment)
        session.add(link)
    link.link_token_hash = _token_hash(token)
    link.token_expires_at = moment + LINK_TTL
    await session.flush()
    return TelegramLinkStart(
        url=f"https://t.me/{settings.telegram_bot_username}?start={token}",
        expires_at=link.token_expires_at,
    )


async def unlink(session: AsyncSession, user: User) -> None:
    link = await session.get(TelegramLink, user.id)
    if link is None:
        return
    chat_id = link.chat_id
    await session.delete(link)
    await session.flush()
    if chat_id is not None:
        await bot_api("sendMessage", {"chat_id": chat_id, "text": TEXT_STOPPED})


async def _link_chat(
    session: AsyncSession, token: str, chat_id: int, username: str | None, moment: datetime
) -> str:
    link = await session.scalar(
        select(TelegramLink).where(TelegramLink.link_token_hash == _token_hash(token))
    )
    if link is None or link.token_expires_at is None or link.token_expires_at < moment:
        return TEXT_EXPIRED
    # Один чат — один пользователь: этот Telegram был привязан к другому аккаунту — отвязываем.
    previous = await session.scalar(
        select(TelegramLink).where(
            TelegramLink.chat_id == chat_id, TelegramLink.user_id != link.user_id
        )
    )
    if previous is not None:
        await session.delete(previous)
        await session.flush()
    link.chat_id = chat_id
    link.username = username[:64] if username else None
    link.linked_at = moment
    link.link_token_hash = None
    link.token_expires_at = None
    await session.flush()
    return TEXT_LINKED


async def handle_update(
    session: AsyncSession, update: dict[str, Any], *, now: datetime | None = None
) -> None:
    """Сообщение боту: /start <токен> привязывает чат, /stop отвязывает, остальное — подсказка."""
    message = update.get("message")
    if not isinstance(message, dict):
        return
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = str(message.get("text") or "").strip()
    if chat.get("type") != "private" or not isinstance(chat_id, int) or not text:
        return

    command, _, argument = text.partition(" ")
    command = command.split("@")[0].lower()
    moment = now or datetime.now(UTC)
    if command == "/start" and argument.strip():
        sender = message.get("from") or {}
        username = sender.get("username") if isinstance(sender.get("username"), str) else None
        reply = await _link_chat(session, argument.strip(), chat_id, username, moment)
    elif command == "/start":
        reply = TEXT_HOW_TO_LINK
    elif command == "/stop":
        link = await session.scalar(select(TelegramLink).where(TelegramLink.chat_id == chat_id))
        if link is None:
            reply = TEXT_NOT_LINKED
        else:
            await session.delete(link)
            await session.flush()
            reply = TEXT_STOPPED
    else:
        reply = TEXT_HELP
    await bot_api("sendMessage", {"chat_id": chat_id, "text": reply})
