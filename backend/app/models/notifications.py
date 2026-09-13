import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import (
    NotificationStatus,
    NotificationType,
    pg_enum,
)

if TYPE_CHECKING:
    from app.models.auth import User


class NotificationQueue(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "notification_queue"
    __table_args__ = (
        CheckConstraint("attempts >= 0 AND attempts <= 3", name="attempts_range"),
        Index("ix_notification_queue_status_scheduled_at", "status", "scheduled_at"),
        Index("ix_notification_queue_tournament_reminder_id", "tournament_reminder_id"),
        Index(
            "ix_notification_queue_user_status_sent_at",
            "user_id",
            "status",
            "sent_at",
        ),
        Index(
            "ix_notification_queue_user_unread",
            "user_id",
            postgresql_where=text("status = 'sent' AND read_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Ginger APP: напоминание о турнире; снятый колокольчик удаляет пуш каскадом.
    tournament_reminder_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tournament_reminders.id", ondelete="CASCADE"),
        nullable=True,
    )
    type: Mapped[NotificationType] = mapped_column(
        pg_enum(NotificationType, "notification_type"),
        nullable=False,
    )
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        pg_enum(NotificationStatus, "notification_status"),
        nullable=False,
        server_default=text("'pending'"),
    )
    attempts: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default=text("0"),
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="notifications")
