from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.models.auth import PushSubscription, User
from app.models.enums import NotificationType
from app.schemas.push import PushSubscribeBody, PushTestResult
from app.services.push_notify import enqueue_push, telegram_linked


class PushUnavailableError(AppError):
    def __init__(self, message: str = "Push notifications are not configured") -> None:
        super().__init__(code="push_unavailable", message=message, status_code=503)


def get_vapid_public_key(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    if not settings.vapid_public_key:
        raise PushUnavailableError()
    return settings.vapid_public_key


async def upsert_subscription(
    session: AsyncSession,
    user: User,
    body: PushSubscribeBody,
) -> PushSubscription:
    settings = get_settings()
    if not settings.vapid_public_key:
        raise PushUnavailableError()

    endpoint = str(body.endpoint)
    existing = await session.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    if existing is not None:
        existing.user_id = user.id
        existing.p256dh = body.p256dh
        existing.auth = body.auth
        existing.device_label = body.device_label
        await session.flush()
        return existing

    row = PushSubscription(
        user_id=user.id,
        endpoint=endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
        device_label=body.device_label,
    )
    session.add(row)
    await session.flush()
    return row


async def delete_subscription(
    session: AsyncSession,
    user: User,
    endpoint: str,
) -> None:
    row = await session.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    if row is None:
        # Worker already drops the row on 410/404; DELETE must stay idempotent
        # so the browser can still clear its local PushSubscription.
        return
    await session.delete(row)
    await session.flush()


async def send_test(session: AsyncSession, user: User) -> PushTestResult:
    """Тестовое уведомление самому себе — во все каналы, как настоящее."""
    devices = await session.scalar(
        select(func.count())
        .select_from(PushSubscription)
        .where(PushSubscription.user_id == user.id)
    )
    telegram = await telegram_linked(session, user.id)
    if not devices and not telegram:
        raise AppError(
            "push_not_subscribed",
            "Уведомления на этом устройстве не включены — включите переключатель выше",
            422,
        )
    await enqueue_push(
        session,
        user_id=user.id,
        type=NotificationType.BROADCAST,
        title="Проверка уведомлений",
        body="Если вы это видите — уведомления Ginger доходят до телефона.",
        url="/profile",
        skip_if_in_app=False,
    )
    return PushTestResult(devices=int(devices or 0), telegram=telegram)
