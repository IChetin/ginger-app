import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TelegramLink(Base):
    """Telegram пользователя для дублирования уведомлений (решение Ивана 15.09).

    Строка появляется, когда игрок нажал «Подключить Telegram»: пока `chat_id` пуст, ждём
    «Старт» в боте по одноразовой ссылке. Один чат — один пользователь.
    """

    __tablename__ = "telegram_links"
    __table_args__ = (
        Index(
            "ix_telegram_links_chat_id",
            "chat_id",
            unique=True,
            postgresql_where=text("chat_id IS NOT NULL"),
        ),
        Index("ix_telegram_links_token", "link_token_hash"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    chat_id: Mapped[int | None] = mapped_column(BigInteger)
    username: Mapped[str | None] = mapped_column(String(64))
    # Хеш одноразового токена из ссылки t.me/<бот>?start=<токен>; сам токен не храним.
    link_token_hash: Mapped[str | None] = mapped_column(String(64))
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
