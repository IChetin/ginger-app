import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, Numeric, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.clubs import Club
    from app.models.players import Player
    from app.models.references import Currency


class PlayerWin(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Выигрыш игрока для ленты (этап 7). Заносит менеджер в админке.

    Ник в ленте — только с согласия игрока (вопрос 11.18): если запись привязана к игроку
    без `results_consent`, лента показывает «Игрок клуба». Запись без привязки публикуется
    с ником, который вписал менеджер.
    """

    __tablename__ = "player_wins"
    __table_args__ = (Index("ix_player_wins_won_on", "won_on"),)

    player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("players.id", ondelete="SET NULL"),
    )
    player_nickname: Mapped[str] = mapped_column(String(64), nullable=False)
    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="SET NULL"),
    )
    tournament_name: Mapped[str] = mapped_column(String(160), nullable=False)
    place: Mapped[int | None] = mapped_column(SmallInteger)
    prize_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(8), ForeignKey("currencies.code"), nullable=False
    )
    won_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    player: Mapped["Player | None"] = relationship()
    club: Mapped["Club | None"] = relationship()
    currency: Mapped["Currency"] = relationship()
