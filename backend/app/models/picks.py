import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import GameType, pg_enum

if TYPE_CHECKING:
    from app.models.clubs import Club


class EditorPick(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Editor's Pick: что Иван отобрал для аудитории — фильтр «★ Editor's Pick» на MTT и CASH.

    Отбор держится не за строку, а за условие: сетки перезаливаются каждый день, лимиты кэша
    появляются и исчезают. MTT — клуб и часть названия турнира (все его старты); CASH — клуб,
    игра и, если задан, большой блайнд. Решение 15.09: MTT обновляется раз в неделю, CASH — раз
    в день.
    """

    __tablename__ = "editor_picks"
    __table_args__ = (
        Index("ix_editor_picks_kind_sort", "kind", "sort_order"),
        CheckConstraint(
            "(kind = 'mtt' AND match IS NOT NULL) OR (kind = 'cash' AND game_type IS NOT NULL)",
            name="target_complete",
        ),
    )

    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    # MTT: фрагмент названия турнира (имя в лобби или с афиши); регистр и знаки не важны.
    match: Mapped[str | None] = mapped_column(String(160))
    # CASH: игра и большой блайнд в фишках клуба; блайнд пустой — все лимиты этой игры.
    game_type: Mapped[GameType | None] = mapped_column(pg_enum(GameType, "game_type"))
    big_blind: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Почему выбрано — строка в карточке турнира или стола.
    note: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    club: Mapped["Club"] = relationship()
