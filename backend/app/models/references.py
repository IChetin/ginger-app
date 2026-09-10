import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CHAR, Date, ForeignKey, LargeBinary, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.imports import ImportJob, ParserProfile
    from app.models.schedule import Event, Series


class Country(Base):
    __tablename__ = "countries"

    code: Mapped[str] = mapped_column(CHAR(2), primary_key=True)
    name_ru: Mapped[str] = mapped_column(String(64), nullable=False)

    venues: Mapped[list["Venue"]] = relationship(back_populates="country")


class Currency(Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(CHAR(3), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(4), nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="currency")
    rates: Mapped[list["FxRate"]] = relationship(
        back_populates="currency",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["Event"]] = relationship(back_populates="currency")


class Organizer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "organizers"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    links: Mapped[dict[str, str]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    # Deferred: list endpoints must not pull the blob.
    logo_data: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    logo_content_type: Mapped[str | None] = mapped_column(String(64))
    schedule_parser_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parser_profiles.id", ondelete="SET NULL"),
    )
    structure_parser_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parser_profiles.id", ondelete="SET NULL"),
    )

    series: Mapped[list["Series"]] = relationship(back_populates="organizer")
    import_jobs: Mapped[list["ImportJob"]] = relationship(back_populates="organizer")
    schedule_parser: Mapped["ParserProfile | None"] = relationship(
        back_populates="organizers_schedule",
        foreign_keys=[schedule_parser_id],
    )
    structure_parser: Mapped["ParserProfile | None"] = relationship(
        back_populates="organizers_structure",
        foreign_keys=[structure_parser_id],
    )


class FxRate(Base):
    __tablename__ = "fx_rates"

    currency_code: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"),
        primary_key=True,
    )
    rate_date: Mapped[date] = mapped_column(Date, primary_key=True)
    rate_rub: Mapped[Decimal] = mapped_column(Numeric(14, 6), nullable=False)

    currency: Mapped[Currency] = relationship(back_populates="rates")


class Venue(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "venues"

    country_code: Mapped[str] = mapped_column(
        ForeignKey("countries.code"),
        nullable=False,
    )
    city: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    zone: Mapped[str | None] = mapped_column(String(64))
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    logo_url: Mapped[str | None] = mapped_column(Text)

    country: Mapped[Country] = relationship(back_populates="venues")
    series: Mapped[list["Series"]] = relationship(back_populates="venue")
