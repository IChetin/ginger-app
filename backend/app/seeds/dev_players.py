"""Тестовые игроки для локального стенда: кредитный и депозитный с подтверждёнными аккаунтами."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.chips import RequisiteTemplate
from app.models.clubs import Club
from app.models.enums import PlayerAccountStatus, PlayerKind, UserRole
from app.models.players import Player, PlayerAccount

logger = logging.getLogger(__name__)

_PLAYERS = [
    # (id пользователя, email, ник, тип, клубы с подтверждёнными аккаунтами)
    (
        uuid.UUID("40000000-0000-4000-8000-000000000101"),
        "player@example.com",
        "player",
        PlayerKind.CREDIT,
        ("ginger", "ginger21"),
    ),
    (
        uuid.UUID("40000000-0000-4000-8000-000000000102"),
        "deposit@example.com",
        "deposit",
        PlayerKind.DEPOSIT,
        ("ginger",),
    ),
]


async def seed_dev_players(session: AsyncSession) -> None:
    clubs = {club.slug: club for club in await session.scalars(select(Club))}
    for user_id, email, nickname, kind, club_slugs in _PLAYERS:
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                id=user_id,
                email=email,
                nickname=nickname,
                role=UserRole.USER,
                email_verified_at=datetime.now(UTC),
            )
            session.add(user)
            await session.flush()
        player = await session.scalar(select(Player).where(Player.user_id == user.id))
        if player is None:
            player = Player(user_id=user.id, kind=kind)
            session.add(player)
            await session.flush()
        for index, slug in enumerate(club_slugs):
            club = clubs.get(slug)
            if club is None:
                continue
            app_account_id = f"{nickname}-{100 + index}"
            exists = await session.scalar(
                select(PlayerAccount.id).where(
                    PlayerAccount.club_id == club.id,
                    PlayerAccount.app_account_id == app_account_id,
                )
            )
            if exists is None:
                session.add(
                    PlayerAccount(
                        player_id=player.id,
                        club_id=club.id,
                        nickname=nickname,
                        app_account_id=app_account_id,
                        status=PlayerAccountStatus.CONFIRMED,
                    )
                )
    if await session.scalar(select(RequisiteTemplate.id).limit(1)) is None:
        session.add(
            RequisiteTemplate(
                title="Карта (пример)",
                body="Карта 0000 0000 0000 0000, получатель Иван И.",
            )
        )
    await session.flush()
    logger.info("dev players seeded")
