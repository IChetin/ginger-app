from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.auth import User
from app.models.enums import UserRole
from app.schemas.admin_users import AdminUserRead, AdminUserRoleUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services import admin_users as users_service

router = APIRouter()


@router.get("/users", response_model=PaginatedResponse[AdminUserRead])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query(max_length=128)] = None,
    role: Annotated[UserRole | None, Query()] = None,
) -> PaginatedResponse[AdminUserRead]:
    return await users_service.list_users(
        db,
        PaginationParams(limit=limit, offset=offset),
        search=search,
        role=role,
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserRead)
async def update_user_role(
    user_id: UUID,
    body: AdminUserRoleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin)],
) -> AdminUserRead:
    return await users_service.update_user_role(db, user_id, body, actor=actor)
