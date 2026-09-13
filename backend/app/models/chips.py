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
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ChipRequestKind, ChipRequestStatus, pg_enum

if TYPE_CHECKING:
    from app.models.clubs import Club
    from app.models.players import Player, PlayerAccount


class Attachment(UUIDPrimaryKeyMixin, Base):
    """Файл на диске сервера рядом с бэкендом — не в базе и не у третьих лиц (вопрос 11.11).

    Скриншот оплаты — чувствительные данные: `delete_after` — через 90 дней после закрытия
    заявки (ТЗ §3.4).
    """

    __tablename__ = "attachments"
    __table_args__ = (Index("uq_attachments_storage_key", "storage_key", unique=True),)

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(200), nullable=False)
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class RequisiteTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Сохранённые реквизиты для депозитных: карта, USDT и т.п. (вопрос 11.11)."""

    __tablename__ = "requisite_templates"

    title: Mapped[str] = mapped_column(String(64), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


class ChipRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Заявка на фишки или вывод (ТЗ §3, §10.1).

    Кредитный: sent → accepted → completed.
    Депозитный: sent → awaiting_payment (реквизиты, 20 минут) → paid (скриншот) → completed;
    без скриншота за 20 минут — expired.
    Вывод: sent → accepted → completed.
    Из любого незавершённого — rejected с обязательным комментарием.
    """

    __tablename__ = "chip_requests"
    __table_args__ = (
        Index("ix_chip_requests_status_created_at", "status", "created_at"),
        Index("ix_chip_requests_player_id_created_at", "player_id", "created_at"),
    )

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[ChipRequestKind] = mapped_column(
        pg_enum(ChipRequestKind, "chip_request_kind"), nullable=False
    )
    status: Mapped[ChipRequestStatus] = mapped_column(
        pg_enum(ChipRequestStatus, "chip_request_status"),
        nullable=False,
        server_default=ChipRequestStatus.SENT.value,
    )
    handled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    payment_requisites: Mapped[str | None] = mapped_column(Text)
    payment_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    screenshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="SET NULL"),
    )
    # Реквизиты вывода не храним в профиле — спрашиваем каждый раз (ТЗ §3.1).
    withdrawal_requisites: Mapped[str | None] = mapped_column(Text)
    reject_comment: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    player: Mapped["Player"] = relationship()
    screenshot: Mapped[Attachment | None] = relationship()
    items: Mapped[list["ChipRequestItem"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChipRequestItem.position",
    )
    events: Mapped[list["ChipRequestEvent"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChipRequestEvent.created_at",
    )


class ChipRequestItem(UUIDPrimaryKeyMixin, Base):
    """Строка заявки «клуб + сумма». Курс фишки фиксируется на момент заявки."""

    __tablename__ = "chip_request_items"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_chip_request_items_request_id", "request_id"),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chip_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    player_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    chip_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    chip_currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code"))

    request: Mapped[ChipRequest] = relationship(back_populates="items")
    account: Mapped["PlayerAccount"] = relationship()
    club: Mapped["Club"] = relationship()


class ChipRequestEvent(UUIDPrimaryKeyMixin, Base):
    """Журнал заявки: кто и когда сменил статус — чтобы разобрать ошибку неделю спустя (§9а.2)."""

    __tablename__ = "chip_request_events"
    __table_args__ = (Index("ix_chip_request_events_request_id", "request_id"),)

    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chip_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    from_status: Mapped[ChipRequestStatus | None] = mapped_column(
        pg_enum(ChipRequestStatus, "chip_request_status")
    )
    to_status: Mapped[ChipRequestStatus] = mapped_column(
        pg_enum(ChipRequestStatus, "chip_request_status"), nullable=False
    )
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    request: Mapped[ChipRequest] = relationship(back_populates="events")
