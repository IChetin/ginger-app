import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PlayerAccountStatus, PlayerKind, PlayerStatus, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.clubs import Club


class Player(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Физлицо-игрок (ТЗ §5.1). Учётная запись входа — `users`, здесь — всё игровое.

    Тип (кредитный / депозитный) — свойство человека целиком, а не отдельного аккаунта.
    Игрока не удаляем: уходят на год и возвращаются, поэтому есть статус «в архиве».
    """

    __tablename__ = "players"
    __table_args__ = (
        Index("uq_players_user_id", "user_id", unique=True),
        Index("ix_players_status", "status"),
        Index("uq_players_referral_code", "referral_code", unique=True),
        Index("ix_players_referrer_player_id", "referrer_player_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[PlayerKind] = mapped_column(
        pg_enum(PlayerKind, "player_kind"),
        nullable=False,
        server_default=PlayerKind.CREDIT.value,
    )
    status: Mapped[PlayerStatus] = mapped_column(
        pg_enum(PlayerStatus, "player_status"),
        nullable=False,
        server_default=PlayerStatus.ACTIVE.value,
    )
    offline_access: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    # Согласие на публикацию выигрышей с ником (вопрос 11.18); без него — «Player X».
    results_consent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    birthday: Mapped[date | None] = mapped_column(Date)
    # Кто привёл — закладывается с первого дня, задним числом не восстановить (ТЗ, лояльность).
    referrer_player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("players.id", ondelete="SET NULL"),
    )
    notes: Mapped[str | None] = mapped_column(Text)
    # Личная многоразовая ссылка «Пригласить» (/r/<код>); выдаётся при первом открытии.
    referral_code: Mapped[str | None] = mapped_column(String(16))

    user: Mapped["User"] = relationship()
    accounts: Mapped[list["PlayerAccount"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PlayerAccount.created_at",
    )


class Invite(UUIDPrimaryKeyMixin, Base):
    """Одноразовая ссылка-приглашение: живёт 7 дней, помнит пригласившего (вопрос 11.8)."""

    __tablename__ = "invites"
    __table_args__ = (Index("uq_invites_token_hash", "token_hash", unique=True),)

    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    player_kind: Mapped[PlayerKind] = mapped_column(
        pg_enum(PlayerKind, "player_kind"),
        nullable=False,
        server_default=PlayerKind.CREDIT.value,
    )
    note: Mapped[str | None] = mapped_column(String(200))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    referrer_player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("players.id", ondelete="SET NULL"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class PlayerAccount(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Игровой аккаунт в клубе. Игрок вводит сам, менеджер подтверждает (вопрос 11.9).

    У одного человека может быть несколько аккаунтов, в том числе в одном клубе.
    """

    __tablename__ = "player_accounts"
    __table_args__ = (
        UniqueConstraint(
            "club_id", "app_account_id", name="uq_player_accounts_club_id_app_account_id"
        ),
        Index("ix_player_accounts_player_id", "player_id"),
        Index("ix_player_accounts_status", "status"),
    )

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
    )
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    nickname: Mapped[str] = mapped_column(String(64), nullable=False)
    # ID аккаунта внутри приложения клуба (PPPoker ID и т.п.).
    app_account_id: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[PlayerAccountStatus] = mapped_column(
        pg_enum(PlayerAccountStatus, "player_account_status"),
        nullable=False,
        server_default=PlayerAccountStatus.PENDING.value,
    )
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    player: Mapped[Player] = relationship(back_populates="accounts")
    club: Mapped["Club"] = relationship()
