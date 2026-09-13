from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import normalize_email
from app.models.auth import User
from app.models.enums import UserRole

logger = logging.getLogger(__name__)

ADMIN_USER_ID = uuid.UUID("40000000-0000-4000-8000-000000000001")
EDITOR_USER_ID = uuid.UUID("40000000-0000-4000-8000-000000000002")


async def seed_dev_users(session: AsyncSession) -> None:
    settings = get_settings()
    specs = [
        (
            ADMIN_USER_ID,
            normalize_email(settings.seed_admin_email),
            settings.seed_admin_nickname,
            UserRole.ADMIN,
        ),
        (
            EDITOR_USER_ID,
            normalize_email(settings.seed_editor_email),
            settings.seed_editor_nickname,
            UserRole.EDITOR,
        ),
    ]
    for user_id, email, nickname, role in specs:
        user = await session.scalar(select(User).where(User.id == user_id))
        if user is None:
            by_email = await session.scalar(select(User).where(User.email == email))
            if by_email is not None:
                user = by_email
            else:
                user = User(
                    id=user_id,
                    email=email,
                    nickname=nickname,
                    role=role,
                    email_verified_at=datetime.now(UTC),
                )
                session.add(user)
        user.email = email
        user.nickname = nickname
        user.role = role
        if user.email_verified_at is None:
            user.email_verified_at = datetime.now(UTC)
    await session.flush()
    logger.info("dev users seeded")
