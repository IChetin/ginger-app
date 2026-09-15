"""Telegram-бот уведомлений: вебхук бота и подключение Telegram из профиля."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ForbiddenError
from app.models.auth import User
from app.schemas.telegram import TelegramLinkStart, TelegramStatus
from app.services import telegram as telegram_service

router = APIRouter(tags=["telegram"])

CurrentUser = Annotated[User, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


@router.post("/telegram/webhook", include_in_schema=False)
async def telegram_webhook(
    request: Request,
    db: Db,
    x_telegram_bot_api_secret_token: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    """Сюда Telegram присылает сообщения боту; секрет в заголовке выставлен при setWebhook."""
    settings = get_settings()
    expected = telegram_service.webhook_secret(settings) if settings.telegram_bot_token else ""
    if not expected or not hmac.compare_digest(
        (x_telegram_bot_api_secret_token or "").encode(), expected.encode()
    ):
        raise ForbiddenError("Неверный секрет вебхука")
    try:
        update = await request.json()
    except ValueError:
        return {"ok": True}
    if isinstance(update, dict):
        await telegram_service.handle_update(db, update)
    return {"ok": True}


@router.get("/me/telegram", response_model=TelegramStatus)
async def get_telegram_status(user: CurrentUser, db: Db) -> TelegramStatus:
    return await telegram_service.status(db, user)


@router.post("/me/telegram/link", response_model=TelegramLinkStart)
async def start_telegram_link(user: CurrentUser, db: Db) -> TelegramLinkStart:
    """Одноразовая ссылка на бота: игрок жмёт «Старт» — и чат привязан."""
    return await telegram_service.start_link(db, user)


@router.delete("/me/telegram", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_telegram(user: CurrentUser, db: Db) -> Response:
    await telegram_service.unlink(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
