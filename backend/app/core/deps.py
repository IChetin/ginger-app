import hmac
from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.cookies import set_session_cookie
from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import parse_session_id
from app.models.auth import User
from app.models.enums import UserRole
from app.services import auth as auth_service


async def get_current_user(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    settings = get_settings()
    session_id = parse_session_id(request.cookies.get(settings.session_cookie_name))
    if session_id is None:
        raise UnauthorizedError("Authentication required")
    user, touched_session_id = await auth_service.get_user_by_session_id(
        db, session_id, settings=settings
    )
    # Sliding window: refresh browser cookie max_age on every authenticated hit.
    set_session_cookie(response, str(touched_session_id), settings=settings)
    return user


async def get_optional_user(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User | None:
    settings = get_settings()
    session_id = parse_session_id(request.cookies.get(settings.session_cookie_name))
    if session_id is None:
        return None
    try:
        user, touched_session_id = await auth_service.get_user_by_session_id(
            db, session_id, settings=settings
        )
    except UnauthorizedError:
        return None
    set_session_cookie(response, str(touched_session_id), settings=settings)
    return user


def require_roles(*roles: UserRole) -> Callable[..., Awaitable[User]]:
    allowed = set(roles)

    async def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed:
            raise ForbiddenError("Insufficient permissions")
        return user

    return dependency


require_editor = require_roles(UserRole.EDITOR, UserRole.ADMIN)
require_admin = require_roles(UserRole.ADMIN)


def get_session_id_from_request(request: Request) -> UUID | None:
    settings = get_settings()
    return parse_session_id(request.cookies.get(settings.session_cookie_name))


async def require_collector(request: Request) -> None:
    """Сборщик лобби ходит с постоянным токеном из настроек, а не с сессией человека."""
    settings = get_settings()
    if not settings.collector_token:
        raise ForbiddenError("Сборщик не настроен")
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token.strip().encode(), settings.collector_token.encode()
    ):
        raise UnauthorizedError("Неверный токен сборщика")
