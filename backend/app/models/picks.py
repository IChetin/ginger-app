import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.clubs import Club


class EditorPick(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Editor's Pick: турнир или стол, который Иван считает интересным своей аудитории.

    Привязан к клубу и фрагменту названия, а не к строке: сетки перезаливаются каждый день,
    кэш-столы появляются и исчезают, а подборка должна жить. Игроку показываем ближайший
    старт турнира или открытые сейчас столы, которые подходят под фрагмент.
    """

    __tablename__ = "editor_picks"
    __table_args__ = (
        Index("ix_editor_picks_kind_sort", "kind", "sort_order"),
        CheckConstraint("kind IN ('mtt', 'cash')", name="kind_known"),
    )

    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    # Фрагмент названия турнира (имя в лобби или с афиши) или стола; регистр и знаки не важны.
    match: Mapped[str] = mapped_column(String(160), nullable=False)
    # Почему выбрано — одна строка на плашке: «гарантия ×3 к бай-ину», «живой стол до утра».
    note: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    club: Mapped["Club"] = relationship()
