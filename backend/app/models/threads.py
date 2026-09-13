import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ThreadStatus, ThreadTopic, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.chips import Attachment
    from app.models.players import Player


class Thread(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Обращение игрока к менеджеру (ТЗ §6): не сплошной чат, а тред по теме со статусом.

    Время последних сообщений каждой стороны и отметки прочтения хранятся в самом треде —
    список и счётчик непрочитанного считаются без загрузки переписки.
    """

    __tablename__ = "threads"
    __table_args__ = (
        Index("ix_threads_player_id", "player_id"),
        Index("ix_threads_status_last_message_at", "status", "last_message_at"),
        # У заявки на фишки — одна переписка.
        Index(
            "uq_threads_chip_request_id",
            "chip_request_id",
            unique=True,
            postgresql_where="chip_request_id IS NOT NULL",
        ),
    )

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
    )
    topic: Mapped[ThreadTopic] = mapped_column(pg_enum(ThreadTopic, "thread_topic"), nullable=False)
    status: Mapped[ThreadStatus] = mapped_column(
        pg_enum(ThreadStatus, "thread_status"),
        nullable=False,
        server_default=ThreadStatus.OPEN.value,
    )
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    chip_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chip_requests.id", ondelete="SET NULL"),
    )
    # «Ответственный» есть в модели, интерфейса передачи в v1 нет (ТЗ §6.1).
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_message_preview: Mapped[str | None] = mapped_column(String(160))
    last_player_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_manager_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    player_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    manager_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    player: Mapped["Player"] = relationship()
    messages: Mapped[list["ThreadMessage"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ThreadMessage.created_at",
    )


class ThreadMessage(UUIDPrimaryKeyMixin, Base):
    """Сообщение в треде: текст (в том числе история раздачи) и/или одна картинка."""

    __tablename__ = "thread_messages"
    __table_args__ = (Index("ix_thread_messages_thread_id_created_at", "thread_id", "created_at"),)

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    from_manager: Mapped[bool] = mapped_column(Boolean, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    thread: Mapped[Thread] = relationship(back_populates="messages")
    author: Mapped["User | None"] = relationship()
    attachment: Mapped["Attachment | None"] = relationship()
