import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.chips import Attachment
    from app.models.clubs import Club
    from app.models.references import Currency


class Promotion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Акция клуба единой плашкой (Иван, 30.09): лидерборд, фриролл, бонус.

    Условия союзов приходят афишами и постами — менеджер вставляет текст или картинку,
    разборщик заполняет черновик, менеджер проверяет подсвеченное и публикует. Игрок видит
    клуб, а не союз: «Просторы покера» — это наш Private.G, Poker21 — Ginger21. После
    `ends_at` акция пропадает сама; ежемесячная оставляет черновик на следующий месяц.
    """

    __tablename__ = "promotions"
    __table_args__ = (
        Index("ix_promotions_live", "ends_at", postgresql_where=text("is_published")),
        Index(
            "uq_promotions_renewed_from",
            "renewed_from_id",
            unique=True,
            postgresql_where=text("renewed_from_id IS NOT NULL"),
        ),
    )

    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE")
    )
    # leaderboard | freeroll | bonus | other
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'leaderboard'")
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    prize_fund: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # Приз не деньгами: «Black VIP Card», билет, мерч.
    prize_extra: Mapped[str | None] = mapped_column(String(80))
    currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code"))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # none | monthly
    recurrence: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'none'")
    )
    # mtt | cash | any
    game: Mapped[str] = mapped_column(String(8), nullable=False, server_default=text("'mtt'"))
    buyin_min: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    buyin_max: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # [{"place": 1, "amount": "250000", "label": null}, …]
    prizes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    # Ежедневные окна с множителем очков по Москве:
    # [{"start": "10:00", "end": "12:00", "multiplier": 2}]
    boost_windows: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    image_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="SET NULL")
    )
    # Откуда разобрано: текст поста или распознанный текст картинки — для сверки.
    source_text: Mapped[str | None] = mapped_column(Text)
    # Поля, в которых разборщик не уверен, — в админке подсвечены «проверить».
    uncertain: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    is_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    renewed_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("promotions.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    club: Mapped["Club | None"] = relationship()
    currency: Mapped["Currency | None"] = relationship()
    image: Mapped["Attachment | None"] = relationship()
