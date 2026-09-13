import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ClubBlock, PokerApp, pg_enum

if TYPE_CHECKING:
    from app.models.references import Currency, Organizer
    from app.models.tournaments import Tournament, TournamentTemplate


class Club(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Клуб в покерном приложении. Союз (NUTS, Black Sea, Poker21) — это `organizers`."""

    __tablename__ = "clubs"
    __table_args__ = (
        Index("uq_clubs_slug", "slug", unique=True),
        Index("ix_clubs_organizer_id", "organizer_id"),
        CheckConstraint("chip_value IS NULL OR chip_value > 0", name="chip_value_positive"),
        CheckConstraint(
            "(chip_value IS NULL) = (chip_currency_code IS NULL)",
            name="chip_rate_complete",
        ),
    )

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    app: Mapped[PokerApp] = mapped_column(pg_enum(PokerApp, "poker_app"), nullable=False)
    # ID клуба внутри приложения — игрок ищет клуб по нему.
    app_club_id: Mapped[str | None] = mapped_column(String(32))
    organizer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizers.id", ondelete="SET NULL"),
    )
    block: Mapped[ClubBlock] = mapped_column(
        pg_enum(ClubBlock, "club_block"),
        nullable=False,
        server_default=ClubBlock.ONLINE.value,
    )

    # Курс фишки: «1 фишка = chip_value chip_currency_code». Бай-ины и гарантии хранятся
    # в фишках, к рублям для фильтра приводятся через этот курс (ТЗ §8а.3).
    chip_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    chip_currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code"))

    # Карточка клуба для игрока.
    games: Mapped[str | None] = mapped_column(String(64))
    limits: Mapped[str | None] = mapped_column(String(64))
    peak_hours: Mapped[str | None] = mapped_column(String(32))
    active_players: Mapped[str | None] = mapped_column(String(32))
    download_url: Mapped[str | None] = mapped_column(Text)
    join_steps: Mapped[str | None] = mapped_column(Text)

    # Только в админке.
    rakeback_note: Mapped[str | None] = mapped_column(Text)
    manager_note: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)

    # Автозагрузка сетки раз в день: ссылка на CSV опубликованного листа союза (NUTS, ProSto).
    schedule_source_url: Mapped[str | None] = mapped_column(Text)
    schedule_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Последняя неудача; при успешной загрузке очищается.
    schedule_fetch_error: Mapped[str | None] = mapped_column(Text)

    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    # «Продвигается сейчас» поднимает клуб на главную (ТЗ §8а.6).
    is_promoted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    organizer: Mapped["Organizer | None"] = relationship()
    chip_currency: Mapped["Currency | None"] = relationship()
    templates: Mapped[list["TournamentTemplate"]] = relationship(
        back_populates="club",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    tournaments: Mapped[list["Tournament"]] = relationship(
        back_populates="club",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
