"""Session cookie helpers shared by auth routes and deps."""

from fastapi import Response

from app.core.config import Settings, get_settings


def set_session_cookie(
    response: Response,
    session_id: str,
    *,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response, *, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    response.delete_cookie(key=settings.session_cookie_name, path="/")
