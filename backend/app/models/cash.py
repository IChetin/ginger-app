import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import GameType, pg_enum

if TYPE_CHECKING:
    from app.models.clubs import Club


class CashTable(UUIDPrimaryKeyMixin, Base):
    """Кэш-стол, как его видел сборщик в лобби клуба (вечерний проход раз в 15–20 минут).

    Не расписание, а снимок: стол живёт, пока сборщик его видит. Пропал из лобби — строка
    удаляется; сборщик замолчал — игроку стол не показываем по давности `seen_at`.
    Суммы — в фишках клуба.
    """

    __tablename__ = "cash_tables"
    __table_args__ = (
        UniqueConstraint("club_id", "table_key", name="uq_cash_tables_club_table_key"),
        Index("ix_cash_tables_seen_at", "seen_at"),
        CheckConstraint("big_blind > 0 AND small_blind >= 0", name="blinds_positive"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    # Как сборщик узнаёт стол между проходами: ID стола в лобби, а без него — имя с блайндами.
    table_key: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    game_type: Mapped[GameType] = mapped_column(pg_enum(GameType, "game_type"), nullable=False)
    small_blind: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    big_blind: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    ante: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    table_size: Mapped[int | None] = mapped_column(SmallInteger)
    seated: Mapped[int | None] = mapped_column(SmallInteger)
    waiting: Mapped[int | None] = mapped_column(SmallInteger)
    min_buyin: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    max_buyin: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Диплинк на стол есть только у PPPoker; у остальных игрок входит по ID клуба.
    app_link: Mapped[str | None] = mapped_column(String(500))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    club: Mapped["Club"] = relationship()
