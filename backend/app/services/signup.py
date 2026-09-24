"""Самостоятельная регистрация с модерацией (решение Ивана 24.09).

Клуб остаётся закрытым: человек заводит аккаунт сам, но до подтверждения менеджером ему
открыты только витрина (расписание, клубы, лента) и диалог с менеджером — именно в нём
менеджер и расспрашивает новичка. Касса, привязка аккаунтов и личная ссылка приглашения
включаются в момент одобрения.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.enums import NotificationType, PlayerKind, PlayerStatus, UserRole
from app.models.players import Player
from app.services.push_notify import enqueue_push

# Новичок платит вперёд — как и пришедший по личной ссылке игрока (E5.5). Менеджер может
# сделать его кредитным прямо в окне подтверждения.
DEFAULT_KIND = PlayerKind.DEPOSIT


def _clean(value: str | None, limit: int) -> str | None:
    cleaned = (value or "").strip()
    return cleaned[:limit] or None


async def create_self_registered(
    session: AsyncSession,
    user: User,
    *,
    real_name: str | None = None,
    play_nickname: str | None = None,
    source: str | None = None,
    settings: Settings | None = None,
    now: datetime | None = None,
) -> Player:
    """Завести игрока без приглашения: на модерации либо сразу активным (режим `open`)."""
    settings = settings or get_settings()
    moment = now or datetime.now(UTC)
    moderated = settings.registration_moderated
    player = Player(
        user_id=user.id,
        kind=DEFAULT_KIND,
        status=PlayerStatus.PENDING if moderated else PlayerStatus.ACTIVE,
        real_name=_clean(real_name, 120),
        play_nickname=_clean(play_nickname, 64),
        source=_clean(source, 64),
    )
    session.add(player)
    await session.flush()
    if moderated:
        await notify_managers(session, user, player, now=moment)
    return player


async def notify_managers(
    session: AsyncSession, user: User, player: Player, *, now: datetime | None = None
) -> None:
    """Менеджерам — пуш о новичке: заявка ждёт решения, а не лежит незамеченной."""
    managers = await session.scalars(
        select(User.id).where(User.role.in_([UserRole.EDITOR, UserRole.ADMIN]))
    )
    body = " · ".join(
        part for part in (player.real_name, player.play_nickname, player.source) if part
    )
    for manager_id in managers:
        await enqueue_push(
            session,
            user_id=manager_id,
            type=NotificationType.NEW_PLAYER,
            title=f"Новая заявка на вступление: {user.nickname}",
            body=body or user.email,
            url=f"/admin/players/{player.id}",
            now=now,
            skip_if_in_app=False,
        )


async def pending_count(session: AsyncSession) -> int:
    count = await session.scalar(
        select(func.count()).select_from(Player).where(Player.status == PlayerStatus.PENDING)
    )
    return int(count or 0)


async def _pending_player(session: AsyncSession, player_id: uuid.UUID) -> Player:
    player = await session.get(Player, player_id)
    if player is None:
        raise NotFoundError("Игрок не найден")
    if player.status is not PlayerStatus.PENDING:
        raise AppError("not_pending", "Заявка уже рассмотрена", 422)
    return player


async def approve(
    session: AsyncSession,
    actor: User,
    player_id: uuid.UUID,
    *,
    kind: PlayerKind | None = None,
    offline_access: bool = False,
    now: datetime | None = None,
) -> Player:
    """Открыть доступ: игрок становится активным и получает уведомление."""
    moment = now or datetime.now(UTC)
    player = await _pending_player(session, player_id)
    player.status = PlayerStatus.ACTIVE
    player.kind = kind or player.kind
    player.offline_access = offline_access
    player.moderated_at = moment
    player.moderated_by_user_id = actor.id
    await session.flush()
    await enqueue_push(
        session,
        user_id=player.user_id,
        type=NotificationType.PLAYER_APPROVED,
        title="Доступ открыт",
        body="Заявка подтверждена: можно привязать аккаунт в клубе и заказать фишки.",
        url="/chips",
        now=moment,
        skip_if_in_app=False,
    )
    return player


async def reject(
    session: AsyncSession,
    actor: User,
    player_id: uuid.UUID,
    *,
    reason: str | None = None,
    now: datetime | None = None,
) -> Player:
    """Отказать. Пуш не шлём — отказ человек видит в приложении, а разговор идёт в диалоге."""
    moment = now or datetime.now(UTC)
    player = await _pending_player(session, player_id)
    player.status = PlayerStatus.REJECTED
    player.moderated_at = moment
    player.moderated_by_user_id = actor.id
    note = _clean(reason, 500)
    if note:
        player.notes = f"{player.notes}\n{note}" if player.notes else note
    await session.flush()
    return player
