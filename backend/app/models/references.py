from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Currency(Base):
    __tablename__ = "currencies"

    # Ginger APP: String(8) вместо CHAR(3) — нужен USDT, в ISO 4217 его нет.
    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(4), nullable=False)

    rates: Mapped[list["FxRate"]] = relationship(
        back_populates="currency",
        cascade="all, delete-orphan",
    )


class Organizer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Союз клубов: NUTS, Black Sea, Poker21, ProSto. По нему выбирается парсер сетки."""

    __tablename__ = "organizers"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    links: Mapped[dict[str, str]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
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
