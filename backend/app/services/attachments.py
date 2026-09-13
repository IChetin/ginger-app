"""Файлы на диске сервера: скриншоты оплаты, позже — вложения тредов (вопрос 11.11)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.chips import Attachment

IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def _path(storage_key: str) -> Path:
    return Path(get_settings().upload_dir) / storage_key


async def save_image(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    purpose: str,
    data: bytes,
    content_type: str | None,
) -> Attachment:
    settings = get_settings()
    extension = IMAGE_TYPES.get((content_type or "").lower())
    if extension is None:
        raise AppError("unsupported_file", "Нужна картинка: JPG, PNG, WEBP или HEIC", 415)
    if not data:
        raise AppError("empty_file", "Файл пустой", 422)
    if len(data) > settings.upload_max_bytes:
        raise AppError("file_too_large", "Файл больше 10 МБ", 413)

    storage_key = f"{purpose}/{uuid.uuid4().hex}{extension}"
    path = _path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

    attachment = Attachment(
        owner_user_id=owner_user_id,
        purpose=purpose,
        content_type=(content_type or "").lower(),
        size_bytes=len(data),
        storage_key=storage_key,
    )
    session.add(attachment)
    await session.flush()
    return attachment


def read_bytes(attachment: Attachment) -> bytes:
    path = _path(attachment.storage_key)
    if not path.is_file():
        raise NotFoundError("Файл не найден")
    return path.read_bytes()


async def purge_expired(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Удалить файлы, срок хранения которых вышел (скриншоты — 90 дней после закрытия)."""
    moment = now or datetime.now(UTC)
    expired = list(
        await session.scalars(select(Attachment).where(Attachment.delete_after < moment))
    )
    for attachment in expired:
        _path(attachment.storage_key).unlink(missing_ok=True)
    if expired:
        await session.execute(
            delete(Attachment).where(Attachment.id.in_([item.id for item in expired]))
        )
        await session.flush()
    return len(expired)
