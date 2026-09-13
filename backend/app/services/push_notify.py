"""Пуши Ginger APP через очередь Day2 (воркер рассылает по подпискам).

Политика (ТЗ §4.2а): пушим только итог заявки и только если игрок не в приложении —
пока оно открыто, экран обновляется сам и шторка молчит.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import Session
from app.models.enums import NotificationStatus, NotificationType
from app.models.notifications import NotificationQueue

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
) -> bool:
    """Поставить пуш в очередь. False — не поставлен: игрок и так в приложении."""
    moment = now or datetime.now(UTC)
    if skip_if_in_app and await user_in_app(session, user_id, moment):
        return False
    session.add(
        NotificationQueue(
            user_id=user_id,
            type=type,
            payload={"title": title[:200], "body": body[:500], "url": url, "type": type.value},
            scheduled_at=moment,
            status=NotificationStatus.PENDING,
            attempts=0,
        )
    )
    await session.flush()
    return True
