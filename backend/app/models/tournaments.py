import uuid
from datetime import date, datetime, time
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
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BountyKind, GameType, TournamentStatus, pg_enum

if TYPE_CHECKING:
    from app.models.clubs import Club


class TournamentFieldsMixin:
    """Поля турнира, общие для шаблона сетки и конкретного старта.

    Все суммы — в фишках клуба; в рубли переводятся через курс клуба (`clubs.chip_value`).
    """

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    game_type: Mapped[GameType] = mapped_column(
        pg_enum(GameType, "game_type"),
        nullable=False,
        server_default=GameType.NLH.value,
    )
    bounty_kind: Mapped[BountyKind] = mapped_column(
        pg_enum(BountyKind, "bounty_kind"),
        nullable=False,
        server_default=BountyKind.NONE.value,
    )
    buyin: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    guarantee: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # Стоимость ребая/аддона; условия — как в источнике: «3x», «(dou/tri)», «1,5x».
    rebuy_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    rebuy_terms: Mapped[str | None] = mapped_column(String(32))
    addon_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    addon_terms: Mapped[str | None] = mapped_column(String(32))
    start_stack: Mapped[int | None] = mapped_column(Integer)
    table_size: Mapped[int | None] = mapped_column(SmallInteger)
    late_reg_levels: Mapped[int | None] = mapped_column(SmallInteger)
    # Длительность уровней: «15/12/12» — поздняя регистрация / далее / финальный стол.
    level_minutes: Mapped[str | None] = mapped_column(String(16))
    structure: Mapped[str | None] = mapped_column(String(32))
    # Для сателлитов — номинал разыгрываемого билета.
    ticket_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Early Bird: сколько первых зарегистрировавшихся получают бонус (больше стек, скидку).
    early_bird_players: Mapped[int | None] = mapped_column(SmallInteger)
    password: Mapped[str | None] = mapped_column(String(64))
    is_promoted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    notes: Mapped[str | None] = mapped_column(Text)


class TournamentTemplate(UUIDPrimaryKeyMixin, TimestampMixin, TournamentFieldsMixin, Base):
    """Регулярный турнир сетки: дни недели + время по МСК (ТЗ §8а.4).

    Из шаблона расписание разворачивается в `tournaments` на недели вперёд.
    """

    __tablename__ = "tournament_templates"
    __table_args__ = (
        Index("ix_tournament_templates_club_id", "club_id"),
        CheckConstraint(
            "cardinality(weekdays) > 0 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]",
            name="weekdays_iso",
        ),
        CheckConstraint("buyin >= 0", name="buyin_non_negative"),
        CheckConstraint(
            "valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from",
            name="validity_range",
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    # ISO: 1 = понедельник … 7 = воскресенье, по московскому времени.
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Минуты от старта до закрытия поздней регистрации (= аддона, где он есть). Считает
    # калькулятор, подтверждает человек — поэтому хранится, а не вычисляется (ТЗ §8а.3.1).
    late_reg_close_offset_min: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    # Откуда шаблон: «nuts-csv» — ведётся импортом и перезаписывается им; NULL — заведён руками.
    source: Mapped[str | None] = mapped_column(String(32))

    club: Mapped["Club"] = relationship(back_populates="templates")
    tournaments: Mapped[list["Tournament"]] = relationship(back_populates="template")


class Tournament(UUIDPrimaryKeyMixin, TimestampMixin, TournamentFieldsMixin, Base):
    """Конкретный старт: развёрнут из шаблона или заведён разово (серия, спецтурнир)."""

    __tablename__ = "tournaments"
    __table_args__ = (
        Index("ix_tournaments_starts_at", "starts_at"),
        Index("ix_tournaments_club_id_starts_at", "club_id", "starts_at"),
        # Идентичность старта — клуб, время, название, а не шаблон: когда у субботы меняется
        # гарантия и она переезжает в другой шаблон, старт и напоминания на нём сохраняются.
        UniqueConstraint("club_id", "starts_at", "name", name="uq_tournaments_club_starts_at_name"),
        CheckConstraint("buyin >= 0", name="buyin_non_negative"),
        CheckConstraint(
            "late_reg_closes_at IS NULL OR late_reg_closes_at >= starts_at",
            name="late_reg_after_start",
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tournament_templates.id", ondelete="SET NULL"),
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    late_reg_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[TournamentStatus] = mapped_column(
        pg_enum(TournamentStatus, "tournament_status"),
        nullable=False,
        server_default=TournamentStatus.SCHEDULED.value,
    )
    # Правлен вручную поверх шаблона — повторное разворачивание его не трогает.
    is_detached: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    club: Mapped["Club"] = relationship(back_populates="tournaments")
    template: Mapped["TournamentTemplate | None"] = relationship(back_populates="tournaments")
