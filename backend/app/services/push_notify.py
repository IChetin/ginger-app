"""Пуши Ginger APP через очередь уведомлений (воркер рассылает по подпискам).

Политика (ТЗ §4.2а): пушим только итог заявки и только если игрок не в приложении —
пока оно открыто, экран обновляется сам и шторка молчит.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import Session
from app.models.enums import NotificationChannel, NotificationStatus, NotificationType
from app.models.notifications import NotificationQueue
from app.models.telegram import TelegramLink

# Сессия, трогавшая API за последние полторы минуты, — игрок сейчас в приложении.
IN_APP_WINDOW = timedelta(seconds=90)


async def user_in_app(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> bool:
    last_seen = await session.scalar(
        select(func.max(Session.last_seen_at)).where(Session.user_id == user_id)
    )
    return last_seen is not None and last_seen >= now - IN_APP_WINDOW


async def enqueue_push(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    type: NotificationType,
    title: str,
    body: str,
    url: str,
    now: datetime | None = None,
    skip_if_in_app: bool = True,
    push: bool = True,
) -> bool:
    """Поставить уведомление в очередь: пуш и, если подключён, Telegram (решение 15.09 —
    подключил бота, получаешь важное в оба канала, без настроек). `push=False` — только
    Telegram. False — ничего не поставлено: игрок в приложении или каналов нет."""
    moment = now or datetime.now(UTC)
    if skip_if_in_app and await user_in_app(session, user_id, moment):
        return False
    channels = [NotificationChannel.PUSH] if push else []
    if await telegram_linked(session, user_id):
        channels.append(NotificationChannel.TELEGRAM)
    for channel in channels:
        session.add(
            NotificationQueue(
                user_id=user_id,
                type=type,
                channel=channel,
                payload={
                    "title": title[:200],
                    "body": body[:500],
                    "url": url,
                    "type": type.value,
                },
                scheduled_at=moment,
                status=NotificationStatus.PENDING,
                attempts=0,
            )
        )
    if not channels:
        return False
    await session.flush()
    return True


async def telegram_linked(session: AsyncSession, user_id: uuid.UUID) -> bool:
    chat_id = await session.scalar(
        select(TelegramLink.chat_id).where(TelegramLink.user_id == user_id)
    )
    return chat_id is not None
