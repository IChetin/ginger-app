"""Личная реферальная ссылка игрока (вопрос 11.8, лояльность E5).

Ссылка многоразовая и бессрочная, по ней друг регистрируется сам — без одобрения. Это безопасно,
потому что опасное и так проходит через человека: новый игрок депозитный (сначала платит),
кредитным делает только админ, аккаунты подтверждает менеджер, фишки выдаёт менеджер.

От утечки в общий чат — лимит регистраций за сутки: сверх него ссылка приостанавливается,
админ видит флаг, игрок или админ перевыпускает код (старый перестаёт работать).

Код короткий и без похожих символов (0/O, 1/I): его показывают QR-кодом и иногда диктуют.
"""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.enums import PlayerStatus
from app.models.players import Player
from app.schemas.chips import ReferralRead

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_LENGTH = 8
CODE_PATTERN = re.compile(rf"^[{_ALPHABET}]{{{_LENGTH}}}$")
WINDOW = timedelta(hours=24)


def looks_like_referral_code(token: str) -> bool:
    return bool(CODE_PATTERN.match(token))


def _new_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))


async def _assign_new_code(session: AsyncSession, player: Player) -> str:
    # 32^8 ≈ 10^12 вариантов — коллизия практически невозможна, но уникальный индекс страхует.
    for _ in range(5):
        code = _new_code()
        try:
            async with session.begin_nested():
                player.referral_code = code
                await session.flush()
            return code
        except IntegrityError:
            continue
    raise RuntimeError("Не удалось выдать реферальный код")


async def registrations_since(session: AsyncSession, player_id: uuid.UUID, since: datetime) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(Player)
        .where(Player.referrer_player_id == player_id, Player.created_at >= since)
    )
    return int(count or 0)


async def invited_counts(session: AsyncSession) -> dict[uuid.UUID, tuple[int, int]]:
    """Пригласивший → (всего приглашённых, за последние сутки). Для списка игроков в админке."""
    since = datetime.now(UTC) - WINDOW
    rows = await session.execute(
        select(
            Player.referrer_player_id,
            func.count(),
            func.count().filter(Player.created_at >= since),
        )
        .where(Player.referrer_player_id.is_not(None))
        .group_by(Player.referrer_player_id)
    )
    return {
        referrer_id: (int(total), int(recent))
        for referrer_id, total, recent in rows.tuples()
        if referrer_id is not None
    }


async def referral_read(
    session: AsyncSession, player: Player, *, now: datetime | None = None
) -> ReferralRead:
    moment = now or datetime.now(UTC)
    code = player.referral_code or await _assign_new_code(session, player)
    limit = get_settings().referral_daily_limit
    recent = await registrations_since(session, player.id, moment - WINDOW)
    total = await session.scalar(
        select(func.count()).select_from(Player).where(Player.referrer_player_id == player.id)
    )
    return ReferralRead(
        code=code,
        path=f"/r/{code}",
        invited_total=int(total or 0),
        registrations_24h=recent,
        daily_limit=limit,
        paused=recent >= limit,
    )


async def rotate_code(session: AsyncSession, player: Player) -> ReferralRead:
    await _assign_new_code(session, player)
    return await referral_read(session, player)


async def find_referrer(
    session: AsyncSession, code: str, *, lock: bool = False
) -> tuple[Player | None, str | None]:
    """Владелец ссылки и причина, почему по ней нельзя зарегистрироваться (None — можно)."""
    statement = (
        select(Player).options(selectinload(Player.user)).where(Player.referral_code == code)
    )
    if lock:
        statement = statement.with_for_update()
    referrer: Player | None = await session.scalar(statement)
    if referrer is None or referrer.status is not PlayerStatus.ACTIVE:
        return None, "not_found"
    recent = await registrations_since(session, referrer.id, datetime.now(UTC) - WINDOW)
    if recent >= get_settings().referral_daily_limit:
        return referrer, "paused"
    return referrer, None
