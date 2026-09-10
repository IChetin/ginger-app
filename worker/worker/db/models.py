from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CHAR, Date, DateTime, Enum, Numeric, SmallInteger, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class NotificationStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationType(StrEnum):
    REMINDER = "reminder"
    SCHEDULE_PUBLISHED = "schedule_published"
    TIME_CHANGED = "time_changed"
    EVENT_CANCELLED = "event_cancelled"
    GUARANTEE_CHANGED = "guarantee_changed"
    SERIES_STARTING = "series_starting"
    SERIES_CANCELLED = "series_cancelled"


_notification_status = Enum(
    NotificationStatus,
    name="notification_status",
    create_type=False,
    values_callable=lambda enum_cls: [item.value for item in enum_cls],
)
_notification_type = Enum(
    NotificationType,
    name="notification_type",
    create_type=False,
    values_callable=lambda enum_cls: [item.value for item in enum_cls],
)


class NotificationQueue(Base):
    __tablename__ = "notification_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    bookmark_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    change_log_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    type: Mapped[NotificationType] = mapped_column(_notification_type, nullable=False)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        _notification_status,
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    last_error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # No ORM FK to users: worker metadata does not include that table.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    device_label: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FxRate(Base):
    __tablename__ = "fx_rates"

    currency_code: Mapped[str] = mapped_column(CHAR(3), primary_key=True)
    rate_date: Mapped[date] = mapped_column(Date, primary_key=True)
    rate_rub: Mapped[Decimal] = mapped_column(Numeric(14, 6), nullable=False)




class User(Base):
    """Minimal projection for FX backfill selection."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    base_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
