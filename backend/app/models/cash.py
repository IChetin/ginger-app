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


class CashGame(UUIDPrimaryKeyMixin, Base):
    """Кэш-игра в клубе: игра и лимит, сколько столов открыто — по списку столов в лобби.

    Решение Ивана 15.09: игроков и занятые места сборщик честно не обновит, поэтому
    показываем только игру, лимит и число столов. Лимит пропал из лобби — строка удаляется;
    сборщик замолчал — игроку не показываем по давности `seen_at`. Суммы — в фишках клуба.
    """

    __tablename__ = "cash_games"
    __table_args__ = (
        UniqueConstraint(
            "club_id", "game_type", "small_blind", "big_blind", name="uq_cash_games_club_limit"
        ),
        Index("ix_cash_games_seen_at", "seen_at"),
        CheckConstraint(
            "big_blind > 0 AND small_blind >= 0 AND tables > 0", name="values_positive"
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    game_type: Mapped[GameType] = mapped_column(pg_enum(GameType, "game_type"), nullable=False)
    small_blind: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    big_blind: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tables: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Диплинк на один из столов лимита — только у PPPoker; у остальных вход по ID клуба.
    app_link: Mapped[str | None] = mapped_column(String(500))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    club: Mapped["Club"] = relationship()
