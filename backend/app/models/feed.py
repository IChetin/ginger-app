import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.chips import Attachment
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


class FeedPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Запись в ленте руками менеджера: анонс, афиша, итоги вторника.

    Лента сама по себе собирается из расписания и выигрышей — сюда попадает то, что
    раньше уходило постом в Telegram. Запись можно закрепить наверху, отложить публикацию
    и задать срок, после которого она пропадает из ленты сама.
    """

    __tablename__ = "feed_posts"
    __table_args__ = (
        Index("ix_feed_posts_published_at", "published_at"),
        Index(
            "uq_feed_posts_tournament_id",
            "tournament_id",
            unique=True,
            postgresql_where=text("tournament_id IS NOT NULL"),
        ),
        # Вкладка «Акции» просит только их и только живые.
        Index("ix_feed_posts_promo_published", "published_at", postgresql_where=text("is_promo")),
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link_url: Mapped[str | None] = mapped_column(String(200))
    link_label: Mapped[str | None] = mapped_column(String(40))
    image_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="SET NULL"),
    )
    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="SET NULL"),
    )
    is_pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Акция клуба (решение Ивана 29.09): такая запись идёт и в ленту, и во вкладку «Акции»
    # рядом с MTT и CASH. Поля те же — клуб, текст, афиша, ссылка и срок показа.
    is_promo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Автозапись о турнире (Иван, 27.09): каждый старт из Editor's Pick, а если сегодня его
    # нет — случайный Major. Одна запись на старт; «удалённая» просто снята с показа.
    tournament_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tournaments.id", ondelete="CASCADE"),
    )
    auto_kind: Mapped[str | None] = mapped_column(String(16))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    club: Mapped["Club | None"] = relationship()
    image: Mapped["Attachment | None"] = relationship()
