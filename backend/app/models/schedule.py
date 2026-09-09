import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
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
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ChangeType, EventStatus, GameType, SeriesStatus, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.hands import Hand
    from app.models.imports import ImportJob
    from app.models.references import Currency, Organizer, Venue
    from app.models.tracker import Result


class Series(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "series"
    __table_args__ = (
        Index("ix_series_status_starts_on", "status", "starts_on"),
        Index("ix_series_venue_id", "venue_id"),
        Index("uq_series_slug", "slug", unique=True),
        Index(
            "uq_series_import_key",
            "import_key",
            unique=True,
            postgresql_where=text("import_key IS NOT NULL"),
        ),
    )

    organizer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizers.id"),
        nullable=False,
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venues.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    import_key: Mapped[str | None] = mapped_column(String(64))
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[SeriesStatus] = mapped_column(
        pg_enum(SeriesStatus, "series_status"),
        nullable=False,
        server_default=text("'announced'"),
    )
    guarantee: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    guarantee_currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code"))
    poster_url: Mapped[str | None] = mapped_column(Text)
    links: Mapped[dict[str, str]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    description: Mapped[str | None] = mapped_column(Text)

    organizer: Mapped["Organizer"] = relationship(back_populates="series")
    venue: Mapped["Venue"] = relationship(back_populates="series")
    events: Mapped[list["Event"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
    )
    import_jobs: Mapped[list["ImportJob"]] = relationship(back_populates="series")


class Event(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_series_id_number", "series_id", "number"),
        UniqueConstraint("series_id", "slug", name="uq_events_series_id_slug"),
        Index(
            "uq_events_series_id_import_key",
            "series_id",
            "import_key",
            unique=True,
            postgresql_where=text("import_key IS NOT NULL"),
        ),
    )

    series_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"),
        nullable=False,
    )
    number: Mapped[int | None] = mapped_column(SmallInteger)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    import_key: Mapped[str | None] = mapped_column(String(64))
    buyin: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    buyin_bounty: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency_code: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"),
        nullable=False,
    )
    guarantee: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    game_type: Mapped[GameType] = mapped_column(
        pg_enum(GameType, "game_type"),
        nullable=False,
        server_default=text("'nlh'"),
    )
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
        server_default=text("'{}'::text[]"),
    )
    start_stack: Mapped[int | None] = mapped_column(Integer)
    start_blinds: Mapped[str | None] = mapped_column(String(32))
    reentry_count: Mapped[int | None] = mapped_column(SmallInteger)
    reentry_unlimited: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    late_reg_level: Mapped[int | None] = mapped_column(SmallInteger)
    day_end_note: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[EventStatus] = mapped_column(
        pg_enum(EventStatus, "event_status"),
        nullable=False,
        server_default=text("'scheduled'"),
    )
    notes: Mapped[str | None] = mapped_column(Text)

    series: Mapped[Series] = relationship(back_populates="events")
    currency: Mapped["Currency"] = relationship(back_populates="events")
    flights: Mapped[list["Flight"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )
    blind_levels: Mapped[list["BlindLevel"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )
    results: Mapped[list["Result"]] = relationship(back_populates="event")
    hands: Mapped[list["Hand"]] = relationship(back_populates="event")


class Flight(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "flights"
    __table_args__ = (
        Index("ix_flights_event_id", "event_id"),
        Index("ix_flights_start_at", "start_at"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str | None] = mapped_column(String(16))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    level_minutes: Mapped[str | None] = mapped_column(String(16))

    event: Mapped[Event] = relationship(back_populates="flights")


class BlindLevel(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "blind_levels"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "structure_set_label",
            "level_no",
            name="uq_blind_levels_event_set_level",
        ),
        Index("ix_blind_levels_event_id", "event_id"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    structure_set_label: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'default'"),
    )
    level_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    sb: Mapped[int | None] = mapped_column(Integer)
    bb: Mapped[int | None] = mapped_column(Integer)
    ante: Mapped[int | None] = mapped_column(Integer)
    minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    is_break: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    is_late_reg_end: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )

    event: Mapped[Event] = relationship(back_populates="blind_levels")


class ChangeLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "change_log"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('series', 'event', 'flight')",
            name="entity_type_values",
        ),
        Index(
            "ix_change_log_entity_type_entity_id_created_at",
            "entity_type",
            "entity_id",
            "created_at",
        ),
    )

    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    change_type: Mapped[ChangeType] = mapped_column(
        pg_enum(ChangeType, "change_type"),
        nullable=False,
    )
    old_value: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    new_value: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    actor: Mapped["User | None"] = relationship(back_populates="changes")


class SlugRedirect(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "slug_redirects"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('series', 'event')",
            name="slug_redirect_entity_type_values",
        ),
        UniqueConstraint("entity_type", "old_slug", name="uq_slug_redirects_entity_type_old_slug"),
        Index("ix_slug_redirects_entity_type_entity_id", "entity_type", "entity_id"),
    )

    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    old_slug: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
