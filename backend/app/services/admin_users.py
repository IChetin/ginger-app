from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.core.system_accounts import DEMO_HANDS_USER_ID, is_system_user_id
from app.models.auth import User
from app.models.enums import UserRole
from app.schemas.admin_users import AdminUserRead, AdminUserRoleUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.auth import is_superadmin_email

logger = logging.getLogger(__name__)


def _user_read(user: User) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        role=user.role,
        is_superadmin=is_superadmin_email(user.email),
        email_verified=user.email_verified_at is not None,
        created_at=user.created_at,
    )


async def list_users(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    search: str | None = None,
    role: UserRole | None = None,
) -> PaginatedResponse[AdminUserRead]:
    hidden = User.id != DEMO_HANDS_USER_ID
    stmt = select(User).where(hidden)
    count_stmt = select(func.count()).select_from(User).where(hidden)

    if search:
        pattern = f"%{search.strip()}%"
        filter_expr = or_(User.email.ilike(pattern), User.nickname.ilike(pattern))
        stmt = stmt.where(filter_expr)
        count_stmt = count_stmt.where(filter_expr)

    if role is not None:
        stmt = stmt.where(User.role == role)
        count_stmt = count_stmt.where(User.role == role)

    total = int(await session.scalar(count_stmt) or 0)
    items = list(
        await session.scalars(
            stmt.order_by(User.created_at.desc()).limit(pagination.limit).offset(pagination.offset)
        )
    )
    return PaginatedResponse(
        items=[_user_read(user) for user in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def update_user_role(
    session: AsyncSession,
    user_id: UUID,
    body: AdminUserRoleUpdate,
    *,
    actor: User,
) -> AdminUserRead:
    user = await session.get(User, user_id)
    if user is None or is_system_user_id(user.id):
        raise NotFoundError("User not found")

    if user.id == actor.id:
        raise AppError(
            "cannot_change_own_role",
            "Cannot change your own role",
            403,
        )

    if is_superadmin_email(user.email, get_settings()):
        raise AppError(
            "superadmin_protected",
            "Cannot change role of env superadmin",
            403,
        )

    old_role = user.role
    if old_role == body.role:
        return _user_read(user)

    user.role = body.role
    await session.flush()
    logger.info(
        "user role changed actor_id=%s target_id=%s old_role=%s new_role=%s",
        actor.id,
        user.id,
        old_role.value,
        body.role.value,
    )
    return _user_read(user)
