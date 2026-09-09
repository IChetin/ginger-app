import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import EntryType, LiveEventType, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.references import Currency
    from app.models.schedule import Event


class Result(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "results"
    __table_args__ = (Index("ix_results_user_id_played_on", "user_id", "played_on"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    entry_type: Mapped[EntryType] = mapped_column(
        pg_enum(EntryType, "entry_type"),
        nullable=False,
        server_default=text("'live_mtt'"),
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    venue_text: Mapped[str | None] = mapped_column(String(160))
    series_text: Mapped[str | None] = mapped_column(String(160))
    played_on: Mapped[date] = mapped_column(Date, nullable=False)
    buyin: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"),
        nullable=False,
    )
    entries_count: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default=text("1"),
    )
    payout: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        server_default=text("0"),
    )
    place: Mapped[int | None] = mapped_column(Integer)
    field_size: Mapped[int | None] = mapped_column(Integer)
    my_share_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        server_default=text("100"),
    )
    note: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User"] = relationship(back_populates="results")
    event: Mapped["Event | None"] = relationship(back_populates="results")
    currency: Mapped["Currency"] = relationship(back_populates="results")
    events: Mapped[list["ResultEvent"]] = relationship(
        back_populates="result",
        cascade="all, delete-orphan",
        order_by="ResultEvent.occurred_at.desc()",
    )


class ResultEvent(Base):
    __tablename__ = "result_events"
    __table_args__ = (
        CheckConstraint(
            "(type = 'note' AND text IS NOT NULL) OR "
            "(type IN ('entry', 'reentry') AND amount IS NOT NULL)",
            name="type_payload",
        ),
        Index("ix_result_events_result_id_occurred_at", "result_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        # Client-generated UUID — no server default.
    )
    result_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("results.id", ondelete="CASCADE"),
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

    result: Mapped[Result] = relationship(back_populates="events")
    currency: Mapped["Currency | None"] = relationship()
