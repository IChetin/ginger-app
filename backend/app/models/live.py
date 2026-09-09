import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import LiveEventType, LiveSessionStatus, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.hands import Hand
    from app.models.references import Currency
    from app.models.schedule import Event, Flight
    from app.models.tracker import Result


class LiveSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "live_sessions"
    __table_args__ = (
        CheckConstraint(
            "(event_id IS NOT NULL) OR (manual_name IS NOT NULL "
            "AND manual_buyin IS NOT NULL AND manual_currency IS NOT NULL)",
            name="linked_or_manual",
        ),
        Index(
            "uq_live_sessions_one_active",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_live_sessions_user_id_status", "user_id", "status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"),
    )
    flight_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("flights.id", ondelete="SET NULL"),
    )
    manual_name: Mapped[str | None] = mapped_column(String(160))
    manual_venue: Mapped[str | None] = mapped_column(String(160))
    manual_buyin: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    manual_currency: Mapped[str | None] = mapped_column(ForeignKey("currencies.code"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[LiveSessionStatus] = mapped_column(
        pg_enum(LiveSessionStatus, "live_session_status"),
        nullable=False,
        server_default=text("'active'"),
    )
    place: Mapped[int | None] = mapped_column(Integer)
    field_size: Mapped[int | None] = mapped_column(Integer)
    payout: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    result_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("results.id", ondelete="SET NULL"),
    )

    user: Mapped["User"] = relationship(back_populates="live_sessions")
    event: Mapped["Event | None"] = relationship()
    flight: Mapped["Flight | None"] = relationship()
    currency: Mapped["Currency | None"] = relationship(
        foreign_keys=[manual_currency],
    )
    result: Mapped["Result | None"] = relationship()
    events: Mapped[list["LiveEvent"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="LiveEvent.occurred_at.desc()",
    )
    hands: Mapped[list["Hand"]] = relationship(back_populates="live_session")


class LiveEvent(Base):
    __tablename__ = "live_events"
    __table_args__ = (
        CheckConstraint(
            "(type = 'note' AND text IS NOT NULL) OR "
            "(type IN ('entry', 'reentry') AND amount IS NOT NULL)",
            name="type_payload",
        ),
        Index("ix_live_events_session_id_occurred_at", "session_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        # Client-generated UUID for offline idempotency — no server default.
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("live_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[LiveEventType] = mapped_column(
        pg_enum(LiveEventType, "live_event_type"),
        nullable=False,
    )
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code"))
    text: Mapped[str | None] = mapped_column(String(500))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[LiveSession] = relationship(back_populates="events")
    currency: Mapped["Currency | None"] = relationship()
