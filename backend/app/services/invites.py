"""Инвайты: клуб закрытый, игрок попадает только по одноразовой ссылке (ТЗ §5, вопрос 11.8)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.core.security import generate_auth_token, hash_auth_token
from app.models.auth import User
from app.models.players import Invite, Player
from app.schemas.chips import InviteCheck, InviteCreate, InviteCreated, InviteRead

_REASON_MESSAGES = {
    "not_found": "Приглашение не найдено. Попросите новую ссылку",
    "used": "По этой ссылке уже зарегистрировались. Попросите новую",
    "expired": "Срок приглашения истёк. Попросите новую ссылку",
    "revoked": "Приглашение отозвано. Попросите новую ссылку",
}


def _hash(token: str) -> str:
    return hash_auth_token(token, secret=get_settings().otp_hmac_secret)


def invite_state(invite: Invite, now: datetime) -> str:
    if invite.revoked_at is not None:
        return "revoked"
    if invite.used_at is not None:
        return "used"
    if invite.expires_at < now:
        return "expired"
    return "active"


def _read(invite: Invite, now: datetime, used_by_nickname: str | None = None) -> InviteRead:
    return InviteRead(
        id=invite.id,
        player_kind=invite.player_kind,
        note=invite.note,
        state=invite_state(invite, now),
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        used_by_nickname=used_by_nickname,
        revoked_at=invite.revoked_at,
        created_at=invite.created_at,
    )


async def create_invite(
    session: AsyncSession,
    *,
    actor: User,
    body: InviteCreate,
    referrer_player_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> InviteCreated:
    moment = now or datetime.now(UTC)
    token = generate_auth_token()
    invite = Invite(
        token_hash=_hash(token),
        player_kind=body.player_kind,
        note=body.note,
        created_by_user_id=actor.id,
        referrer_player_id=referrer_player_id,
        expires_at=moment + timedelta(days=get_settings().invite_ttl_days),
    )
    session.add(invite)
    await session.flush()
    await session.refresh(invite, ["created_at"])
    read = _read(invite, moment)
    return InviteCreated(**read.model_dump(), token=token, path=f"/invite/{token}")


async def list_invites(session: AsyncSession, *, limit: int = 100) -> list[InviteRead]:
    used_by = aliased(User)
    rows = await session.execute(
        select(Invite, used_by.nickname)
        .outerjoin(used_by, used_by.id == Invite.used_by_user_id)
        .order_by(Invite.created_at.desc())
        .limit(limit)
    )
    now = datetime.now(UTC)
    return [_read(invite, now, nickname) for invite, nickname in rows.tuples()]


async def revoke_invite(session: AsyncSession, invite_id: uuid.UUID) -> InviteRead:
    invite = await session.get(Invite, invite_id)
    if invite is None:
        raise NotFoundError("Приглашение не найдено")
    now = datetime.now(UTC)
    if invite.used_at is None and invite.revoked_at is None:
        invite.revoked_at = now
        await session.flush()
    return _read(invite, now)


async def _find(session: AsyncSession, token: str, *, lock: bool = False) -> Invite | None:
    statement = select(Invite).where(Invite.token_hash == _hash(token))
    if lock:
        statement = statement.with_for_update()
    invite: Invite | None = await session.scalar(statement)
    return invite


async def check_invite(session: AsyncSession, token: str) -> InviteCheck:
    invite = await _find(session, token)
    if invite is None:
        return InviteCheck(valid=False, reason="not_found")
    state = invite_state(invite, datetime.now(UTC))
    return InviteCheck(valid=state == "active", reason=None if state == "active" else state)


async def require_active_invite(
    session: AsyncSession, token: str | None, *, lock: bool = False
) -> Invite:
    if not token:
        raise AppError("invite_required", "Регистрация только по приглашению", 403)
    invite = await _find(session, token, lock=lock)
    reason = "not_found" if invite is None else invite_state(invite, datetime.now(UTC))
    if invite is None or reason != "active":
        raise AppError(f"invite_{reason}", _REASON_MESSAGES[reason], 403)
    return invite


async def consume_invite(session: AsyncSession, invite: Invite, user: User) -> Player:
    """Отметить инвайт использованным и завести игрока с типом и пригласившим из инвайта."""
    now = datetime.now(UTC)
    invite.used_at = now
    invite.used_by_user_id = user.id
    player = Player(
        user_id=user.id,
        kind=invite.player_kind,
        referrer_player_id=invite.referrer_player_id,
    )
    session.add(player)
    await session.flush()
    return player
