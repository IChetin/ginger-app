"""Отправленные пуши игрока: список, прочитанность, история.

Сами пуши ставят в очередь сервисы (заявки, треды, колокольчики), рассылает воркер.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.enums import NotificationChannel, NotificationStatus, NotificationType
from app.models.notifications import NotificationQueue
from app.schemas.notifications import (
    NotificationHistoryItem,
    NotificationListItem,
    NotificationListResponse,
)


def _payload(row: NotificationQueue) -> dict[str, object]:
    return row.payload if isinstance(row.payload, dict) else {}


async def list_notification_history(
    session: AsyncSession, user: User, *, days: int = 30
) -> list[NotificationHistoryItem]:
    cutoff = datetime.now(UTC) - timedelta(days=max(1, min(90, days)))
    rows = await session.scalars(
        select(NotificationQueue)
        .where(
            NotificationQueue.user_id == user.id,
            NotificationQueue.channel == NotificationChannel.PUSH,
            NotificationQueue.status == NotificationStatus.SENT,
            NotificationQueue.sent_at.is_not(None),
            NotificationQueue.sent_at >= cutoff,
        )
        .order_by(NotificationQueue.sent_at.desc())
    )
    return [
        NotificationHistoryItem(
            id=row.id,
            type=row.type,
            title=str(_payload(row).get("title") or ""),
            body=str(_payload(row).get("body") or ""),
            url=str(_payload(row).get("url") or ""),
            status=row.status,
            scheduled_at=row.scheduled_at,
            sent_at=row.sent_at,
            created_at=row.created_at,
        )
        for row in rows
    ]


async def list_notifications(
    session: AsyncSession,
    user: User,
    *,
    type_filter: str | None = None,
    unread_only: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> NotificationListResponse:
    clamped_limit = max(1, min(50, limit))
    clamped_offset = max(0, offset)
    conditions = [
        NotificationQueue.user_id == user.id,
        NotificationQueue.channel == NotificationChannel.PUSH,
        NotificationQueue.status == NotificationStatus.SENT,
        NotificationQueue.sent_at.is_not(None),
    ]
    if unread_only:
        conditions.append(NotificationQueue.read_at.is_(None))
    if type_filter == "reminders":
        conditions.append(NotificationQueue.type == NotificationType.REMINDER)

    total = int(
        await session.scalar(select(func.count()).select_from(NotificationQueue).where(*conditions))
        or 0
    )
    rows = list(
        await session.scalars(
            select(NotificationQueue)
            .where(*conditions)
            .order_by(NotificationQueue.sent_at.desc(), NotificationQueue.id.desc())
            .limit(clamped_limit)
            .offset(clamped_offset)
        )
    )
    items = [
        NotificationListItem(
            id=row.id,
            type=row.type,
            title=str(_payload(row).get("title") or ""),
            body=str(_payload(row).get("body") or ""),
            url=str(_payload(row).get("url") or ""),
            sent_at=row.sent_at,
            read_at=row.read_at,
            is_unread=row.read_at is None,
        )
        for row in rows
    ]
    return NotificationListResponse(
        items=items,
        total=total,
        limit=clamped_limit,
        offset=clamped_offset,
        has_more=clamped_offset + len(items) < total,
    )


async def mark_notifications_read(
    session: AsyncSession,
    user: User,
    *,
    ids: list[UUID] | None = None,
    mark_all: bool = False,
) -> int:
    conditions = [
        NotificationQueue.user_id == user.id,
        NotificationQueue.channel == NotificationChannel.PUSH,
        NotificationQueue.status == NotificationStatus.SENT,
        NotificationQueue.read_at.is_(None),
    ]
    if not mark_all:
        if not ids:
            return 0
        conditions.append(NotificationQueue.id.in_(ids))
    result = await session.execute(
        update(NotificationQueue)
        .where(*conditions)
        .values(read_at=datetime.now(UTC))
        .returning(NotificationQueue.id)
    )
    marked = len(result.all())
    await session.flush()
    return marked


async def unread_notifications_count(session: AsyncSession, user: User) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(NotificationQueue)
            .where(
                NotificationQueue.user_id == user.id,
                NotificationQueue.channel == NotificationChannel.PUSH,
                NotificationQueue.status == NotificationStatus.SENT,
                NotificationQueue.read_at.is_(None),
            )
        )
        or 0
    )
