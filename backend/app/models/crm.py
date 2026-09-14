import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class Broadcast(UUIDPrimaryKeyMixin, Base):
    """Ручная рассылка из админки (ТЗ §4.2б, §9а.2): кто, кому и что отправил.

    Сегмент хранится как есть — через месяц видно, кого именно звали на розыгрыш.
    """

    __tablename__ = "broadcasts"
    __table_args__ = (Index("ix_broadcasts_created_at", "created_at"),)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    body: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(String(200), nullable=False)
    segment: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Сколько игроков в сегменте и скольким реально ушёл пуш (есть подписка на устройстве).
    recipients: Mapped[int] = mapped_column(Integer, nullable=False)
    pushes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
