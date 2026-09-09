from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.system_accounts import (
    DEMO_HANDS_USER_EMAIL,
    DEMO_HANDS_USER_ID,
    DEMO_HANDS_USER_NICKNAME,
)
from app.models.auth import User
from app.models.enums import HandStatus
from app.models.hands import Hand
from app.schemas.hands import HandData
from app.seeds.runner import seed_reference_data

logger = logging.getLogger(__name__)

DEMO_HAND_1_ID = UUID("00000000-0000-4000-8000-0000000000d1")
DEMO_HAND_2_ID = UUID("00000000-0000-4000-8000-0000000000d2")
DEMO_HAND_3_ID = UUID("00000000-0000-4000-8000-0000000000d3")

# Result pot/profit are overwritten by HandData validation from the engine.
_HAND_1: dict[str, Any] = {
    "schema_version": 1,
    "table_size": 9,
    "blinds": {"sb": 2000, "bb": 4000, "ante": 4000, "ante_mode": "bb"},
    "hero_seat": 1,
    "button_seat": 1,
    "seats": [
        {
            "seat": 1,
            "position": "BTN",
            "name": "Вы",
            "stack": 200000,
            "is_hero": True,
            "cards": ["As", "Ks"],
        },
        {"seat": 2, "position": "SB", "name": "Тильт", "stack": 85000},
        {"seat": 3, "position": "BB", "name": "Капитан", "stack": 120000},
        {"seat": 4, "position": "UTG", "name": "Миша", "stack": 95000},
        {"seat": 5, "position": "+1", "name": "Леша", "stack": 70000},
        {"seat": 6, "position": "+2", "name": "Саня", "stack": 110000},
        {"seat": 7, "position": "MP", "name": "Костя", "stack": 140000},
        {"seat": 8, "position": "HJ", "name": "Вадим", "stack": 90000},
        {
            "seat": 9,
            "position": "CO",
            "name": "Боцман",
            "stack": 180000,
            "cards": ["Qh", "Qd"],
        },
    ],
    "streets": [
        {
            "street": "preflop",
            "board": [],
            "actions": [
                {"seat": 4, "action": "fold"},
                {"seat": 5, "action": "fold"},
                {"seat": 6, "action": "fold"},
                {"seat": 7, "action": "fold"},
                {"seat": 8, "action": "fold"},
                {"seat": 9, "action": "raise", "amount": 10000},
                {"seat": 1, "action": "raise", "amount": 28000},
                {"seat": 2, "action": "fold"},
                {"seat": 3, "action": "fold"},
                {"seat": 9, "action": "call", "amount": 28000},
            ],
        },
        {
            "street": "flop",
            "board": ["Js", "Ts", "4d"],
            "actions": [
                {"seat": 9, "action": "check"},
                {"seat": 1, "action": "bet", "amount": 24000},
                {"seat": 9, "action": "call", "amount": 24000},
            ],
        },
        {
            "street": "turn",
            "board": ["Js", "Ts", "4d", "7c"],
            "actions": [
                {"seat": 9, "action": "check"},
                {"seat": 1, "action": "allin", "amount": 200000},
                {"seat": 9, "action": "allin", "amount": 180000},
            ],
        },
        {
            "street": "river",
            "board": ["Js", "Ts", "4d", "7c", "Ah"],
            "actions": [],
        },
    ],
    "result": {
        "winner_seats": [1],
        "pot": 0,
        "hero_invested": 0,
        "hero_profit": 0,
        "side_pots": None,
    },
}

_HAND_2: dict[str, Any] = {
    "schema_version": 1,
    "table_size": 6,
    "blinds": {"sb": 500, "bb": 1000, "ante": 1000, "ante_mode": "bb"},
    "hero_seat": 1,
    "button_seat": 1,
    "seats": [
        {
            "seat": 1,
            "position": "BTN",
            "name": "Вы",
            "stack": 48000,
            "is_hero": True,
            "cards": ["Ah", "Ad"],
        },
        {"seat": 2, "position": "SB", "name": "Рег из Минска", "stack": 32000},
        {"seat": 3, "position": "BB", "name": "Боцман", "stack": 41000},
        {"seat": 4, "position": "UTG", "name": "Капитан", "stack": 25000},
        {"seat": 5, "position": "HJ", "name": "Тильт", "stack": 19000},
        {"seat": 6, "position": "CO", "name": "Саня", "stack": 36000},
    ],
    "streets": [
        {
            "street": "preflop",
            "board": [],
            "actions": [
                {"seat": 4, "action": "fold"},
                {"seat": 5, "action": "fold"},
                {"seat": 6, "action": "fold"},
                {"seat": 1, "action": "raise", "amount": 2500},
                {"seat": 2, "action": "fold"},
                {"seat": 3, "action": "fold"},
            ],
        },
    ],
    "result": {
        "winner_seats": [1],
        "pot": 0,
        "hero_invested": 0,
        "hero_profit": 0,
        "side_pots": None,
    },
}

_HAND_3: dict[str, Any] = {
    "schema_version": 1,
    "table_size": 6,
    "blinds": {"sb": 1000, "bb": 2000, "ante": 2000, "ante_mode": "bb"},
    "hero_seat": 6,
    "button_seat": 1,
    "seats": [
        {
            "seat": 1,
            "position": "BTN",
            "name": "Рег из Минска",
            "stack": 85000,
            "cards": ["7h", "7d"],
        },
        {"seat": 2, "position": "SB", "name": "Боцман", "stack": 62000},
        {
            "seat": 3,
            "position": "BB",
            "name": "Капитан",
            "stack": 74000,
            "cards": ["As", "Jh"],
        },
        {
            "seat": 6,
            "position": "CO",
            "name": "Вы",
            "stack": 96000,
            "is_hero": True,
            "cards": ["Kc", "Qc"],
        },
    ],
    "streets": [
        {
            "street": "preflop",
            "board": [],
            "actions": [
                {"seat": 6, "action": "raise", "amount": 4500},
                {"seat": 1, "action": "call", "amount": 4500},
                {"seat": 2, "action": "call", "amount": 4500},
                {"seat": 3, "action": "call", "amount": 4500},
            ],
        },
        {
            "street": "flop",
            "board": ["Qd", "9s", "2c"],
            "actions": [
                {"seat": 2, "action": "check"},
                {"seat": 3, "action": "bet", "amount": 6000},
                {"seat": 6, "action": "raise", "amount": 16000},
                {"seat": 1, "action": "call", "amount": 16000},
                {"seat": 2, "action": "call", "amount": 16000},
                {"seat": 3, "action": "call", "amount": 16000},
            ],
        },
        {
            "street": "turn",
            "board": ["Qd", "9s", "2c", "7c"],
            "actions": [
                {"seat": 2, "action": "check"},
                {"seat": 3, "action": "check"},
                {"seat": 6, "action": "bet", "amount": 12000},
                {"seat": 1, "action": "call", "amount": 12000},
                {"seat": 2, "action": "call", "amount": 12000},
                {"seat": 3, "action": "call", "amount": 12000},
            ],
        },
        {
            "street": "river",
            "board": ["Qd", "9s", "2c", "7c", "3d"],
            "actions": [
                {"seat": 2, "action": "check"},
                {"seat": 3, "action": "check"},
                {"seat": 6, "action": "bet", "amount": 18000},
                {"seat": 1, "action": "call", "amount": 18000},
                {"seat": 2, "action": "call", "amount": 18000},
                {"seat": 3, "action": "fold"},
            ],
        },
    ],
    "result": {
        "winner_seats": [1],
        "pot": 0,
        "hero_invested": 0,
        "hero_profit": 0,
        "side_pots": None,
    },
}

DEMO_HANDS: tuple[dict[str, Any], ...] = (
    {
        "id": DEMO_HAND_1_ID,
        "slug": "demo-1",
        "title": "Main Event",
        "note": "Правильно ли было пушить тёрн с 15 аутами?",
        "created_offset_days": -2,
        "data": _HAND_1,
    },
    {
        "id": DEMO_HAND_2_ID,
        "slug": "demo-2",
        "title": "#18 Turbo",
        "note": "Стоило ли изолировать крупнее с карманными тузами?",
        "created_offset_days": -6,
        "data": _HAND_2,
    },
    {
        "id": DEMO_HAND_3_ID,
        "slug": "demo-3",
        "title": "#7 Mystery Bounty",
        "note": "Правильно ли сыграл ривер?",
        "created_offset_days": -14,
        "data": _HAND_3,
    },
)


def _validated_payload(raw: dict[str, Any]) -> dict[str, Any]:
    return HandData.model_validate(raw).model_dump(mode="json")


async def _ensure_demo_user(session: AsyncSession) -> User:
    user = await session.get(User, DEMO_HANDS_USER_ID)
    if user is None:
        by_email = await session.scalar(select(User).where(User.email == DEMO_HANDS_USER_EMAIL))
        if by_email is not None:
            user = by_email
        else:
            nick_taken = await session.scalar(
                select(User).where(User.nickname == DEMO_HANDS_USER_NICKNAME)
            )
            user = User(
                id=DEMO_HANDS_USER_ID,
                email=DEMO_HANDS_USER_EMAIL,
                nickname=DEMO_HANDS_USER_NICKNAME if nick_taken is None else "Day2",
                email_verified_at=datetime.now(UTC),
            )
            session.add(user)
            await session.flush()
            return user
    user.email = DEMO_HANDS_USER_EMAIL
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    await session.flush()
    return user


async def seed_demo_hands(session: AsyncSession) -> None:
    """Публичные демо-раздачи для шеринга. Идемпотентно, во всех окружениях."""
    await seed_reference_data(session)
    user = await _ensure_demo_user(session)
    now = datetime.now(UTC)
    for spec in DEMO_HANDS:
        created = now + timedelta(days=int(spec["created_offset_days"]))
        payload = _validated_payload(spec["data"])
        row = await session.get(Hand, spec["id"])
        if row is None:
            by_slug = await session.scalar(select(Hand).where(Hand.slug == spec["slug"]))
            if by_slug is not None:
                row = by_slug
            else:
                row = Hand(
                    id=spec["id"],
                    user_id=user.id,
                    slug=spec["slug"],
                    status=HandStatus.PUBLISHED,
                    current_step=None,
                    is_public=True,
                    title=spec["title"],
                    note=spec["note"],
                    data=payload,
                    views_count=0,
                    created_at=created,
                    updated_at=created,
                )
                session.add(row)
                continue
        row.user_id = user.id
        row.slug = spec["slug"]
        row.status = HandStatus.PUBLISHED
        row.current_step = None
        row.is_public = True
        row.title = spec["title"]
        row.note = spec["note"]
        row.data = payload
        row.event_id = None
        row.series_id = None
        row.live_session_id = None
        row.created_at = created
        row.updated_at = created
    await session.flush()
    logger.info("demo hands seeded")
