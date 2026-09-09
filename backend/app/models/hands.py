import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import HandStatus, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.live import LiveSession
    from app.models.schedule import Event, Series


class Hand(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "hands"
    __table_args__ = (
        Index("uq_hands_slug", "slug", unique=True),
        Index("ix_hands_user_id_created_at", "user_id", "created_at"),
        Index(
            "ix_hands_event_id",
            "event_id",
            postgresql_where=text("event_id IS NOT NULL"),
        ),
        Index(
            "ix_hands_series_id",
            "series_id",
            postgresql_where=text("series_id IS NOT NULL"),
        ),
        CheckConstraint(
            "event_id IS NULL OR series_id IS NULL",
            name="ck_hands_event_xor_series",
        ),
        Index(
            "ix_hands_note_trgm",
            "note",
            postgresql_using="gin",
            postgresql_ops={"note": "gin_trgm_ops"},
        ),
        Index("ix_hands_user_id_status_updated_at", "user_id", "status", "updated_at"),
        Index(
            "ix_hands_user_id_drafts",
            "user_id",
            postgresql_where=text("status = 'draft'"),
        ),
        CheckConstraint(
            "(status = 'published' AND slug IS NOT NULL AND current_step IS NULL) "
            "OR (status = 'draft' AND slug IS NOT NULL AND is_public = false "
            "AND current_step BETWEEN 1 AND 4)",
            name="hand_status_shape",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(12), nullable=False)
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"),
    )
    series_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("series.id", ondelete="SET NULL"),
    )
    live_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("live_sessions.id", ondelete="SET NULL"),
    )
    status: Mapped[HandStatus] = mapped_column(
        pg_enum(HandStatus, "hand_status"),
        nullable=False,
        server_default=text("'published'"),
    )
    current_step: Mapped[int | None] = mapped_column(SmallInteger)
    is_public: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )
    title: Mapped[str | None] = mapped_column(String(160))
    note: Mapped[str | None] = mapped_column(Text)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    views_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    user: Mapped["User"] = relationship(back_populates="hands")
    event: Mapped["Event | None"] = relationship(back_populates="hands")
    series: Mapped["Series | None"] = relationship()
    live_session: Mapped["LiveSession | None"] = relationship(back_populates="hands")
