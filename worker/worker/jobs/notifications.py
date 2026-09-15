from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from worker.config import Settings, get_settings
from worker.db.models import (
    NotificationChannel,
    NotificationQueue,
    NotificationStatus,
    PushSubscription,
    TelegramLink,
)
from worker.db.session import session_scope
from worker.push.client import PushOutcome, send_web_push
from worker.push.schemas import PushPayload
from worker.telegram.client import send_telegram

logger = logging.getLogger("ginger.worker.notifications")

MAX_ATTEMPTS = 3


def process_notification_queue(settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    processed = 0
    with session_scope() as session:
        due_ids = _claim_due_ids(session, settings.notification_batch_size)
        for notification_id in due_ids:
            _process_one(session, notification_id, settings)
            processed += 1
    if processed:
        logger.info("processed %s notification jobs", processed)
    return processed


def _claim_due_ids(session: Session, batch_size: int) -> list[UUID]:
    rows = session.execute(
        text(
            """
            SELECT id
            FROM notification_queue
            WHERE status = 'pending'
              AND scheduled_at <= NOW()
            ORDER BY scheduled_at ASC
            LIMIT :batch_size
            FOR UPDATE SKIP LOCKED
            """
        ),
        {"batch_size": batch_size},
    ).fetchall()
    return [row[0] for row in rows]


def _process_one(session: Session, notification_id: UUID, settings: Settings) -> None:
    notification = session.get(NotificationQueue, notification_id)
    if notification is None or notification.status != NotificationStatus.PENDING:
        return
    if notification.channel == NotificationChannel.TELEGRAM:
        _process_telegram(session, notification, settings)
        return

    subscriptions = list(
        session.scalars(
            select(PushSubscription).where(PushSubscription.user_id == notification.user_id)
        )
    )
    if not subscriptions:
        notification.status = NotificationStatus.FAILED
        notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
        notification.last_error = "no_subscriptions"
        return

    try:
        payload_model = PushPayload.model_validate(notification.payload)
        payload = payload_model.model_dump(exclude_none=True)
    except Exception:
        notification.status = NotificationStatus.FAILED
        notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
        notification.last_error = "invalid_payload"
        return

    success = False
    fatal = False
    retryable = False
    last_error: str | None = None

    for subscription in list(subscriptions):
        result = send_web_push(
            endpoint=subscription.endpoint,
            p256dh=subscription.p256dh,
            auth=subscription.auth,
            payload=payload,
            settings=settings,
        )
        if result.outcome == PushOutcome.SUCCESS:
            success = True
            subscription.last_success_at = datetime.now(UTC)
        elif result.outcome == PushOutcome.GONE:
            session.delete(subscription)
        elif result.outcome == PushOutcome.FATAL:
            fatal = True
            last_error = result.error
        else:
            retryable = True
            last_error = result.error

    if success:
        notification.status = NotificationStatus.SENT
        notification.sent_at = datetime.now(UTC)
        notification.last_error = None
        return

    notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
    notification.last_error = last_error or "delivery_failed"
    if fatal or notification.attempts >= MAX_ATTEMPTS or not retryable:
        notification.status = NotificationStatus.FAILED
    else:
        notification.status = NotificationStatus.PENDING


def _fail(notification: NotificationQueue, error: str) -> None:
    notification.status = NotificationStatus.FAILED
    notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
    notification.last_error = error


def _process_telegram(
    session: Session, notification: NotificationQueue, settings: Settings
) -> None:
    """Второй канал — Telegram-бот (решение 15.09). Чат, заблокировавший бота, отвязывается."""
    link = session.get(TelegramLink, notification.user_id)
    if link is None or link.chat_id is None:
        _fail(notification, "telegram_not_linked")
        return
    try:
        payload = PushPayload.model_validate(notification.payload).model_dump(exclude_none=True)
    except Exception:
        _fail(notification, "invalid_payload")
        return

    result = send_telegram(chat_id=link.chat_id, payload=payload, settings=settings)
    if result.outcome == PushOutcome.SUCCESS:
        notification.status = NotificationStatus.SENT
        notification.sent_at = datetime.now(UTC)
        notification.last_error = None
        return
    if result.outcome == PushOutcome.GONE:
        session.delete(link)
    notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
    notification.last_error = result.error or "telegram_failed"
    retry = result.outcome == PushOutcome.RETRYABLE and notification.attempts < MAX_ATTEMPTS
    notification.status = NotificationStatus.PENDING if retry else NotificationStatus.FAILED


def process_notification_queue_with_sender(
    session: Session,
    *,
    settings: Settings,
    sender: Any,
) -> int:
    """Test helper: process due rows using injected sender callable."""
    due_ids = _claim_due_ids(session, settings.notification_batch_size)
    count = 0
    for notification_id in due_ids:
        notification = session.get(NotificationQueue, notification_id)
        if notification is None:
            continue
        subscriptions = list(
            session.scalars(
                select(PushSubscription).where(PushSubscription.user_id == notification.user_id)
            )
        )
        if not subscriptions:
            notification.status = NotificationStatus.FAILED
            notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
            notification.last_error = "no_subscriptions"
            count += 1
            continue

        success = False
        fatal = False
        retryable = False
        last_error: str | None = None
        for subscription in list(subscriptions):
            result = sender(subscription, notification.payload, settings)
            if result.outcome == PushOutcome.SUCCESS:
                success = True
                subscription.last_success_at = datetime.now(UTC)
            elif result.outcome == PushOutcome.GONE:
                session.delete(subscription)
            elif result.outcome == PushOutcome.FATAL:
                fatal = True
                last_error = result.error
            else:
                retryable = True
                last_error = result.error

        if success:
            notification.status = NotificationStatus.SENT
            notification.sent_at = datetime.now(UTC)
            notification.last_error = None
        else:
            notification.attempts = min(notification.attempts + 1, MAX_ATTEMPTS)
            notification.last_error = last_error or "delivery_failed"
            if fatal or notification.attempts >= MAX_ATTEMPTS or not retryable:
                notification.status = NotificationStatus.FAILED
            else:
                notification.status = NotificationStatus.PENDING
        count += 1
    return count
