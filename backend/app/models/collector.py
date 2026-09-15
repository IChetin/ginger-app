import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import (
    CollectorRunKind,
    CollectorRunStatus,
    PokerApp,
    TournamentChangeKind,
    TournamentChangeStatus,
    pg_enum,
)


class CollectorRun(UUIDPrimaryKeyMixin, Base):
    """Один проход сборщика (телефон + скрипт) по лобби одного приложения."""

    __tablename__ = "collector_runs"
    __table_args__ = (Index("ix_collector_runs_started_at", "started_at"),)

    kind: Mapped[CollectorRunKind] = mapped_column(
        pg_enum(CollectorRunKind, "collector_run_kind"), nullable=False
    )
    app: Mapped[PokerApp] = mapped_column(pg_enum(PokerApp, "poker_app"), nullable=False)
    status: Mapped[CollectorRunStatus] = mapped_column(
        pg_enum(CollectorRunStatus, "collector_run_status"),
        nullable=False,
        server_default=CollectorRunStatus.RUNNING.value,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    stats: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )


class CollectorSnapshot(UUIDPrimaryKeyMixin, Base):
    """Что сборщик увидел в лобби клуба — как есть, чтобы разбирать спорные случаи."""

    __tablename__ = "collector_snapshots"
    __table_args__ = (Index("ix_collector_snapshots_club_captured", "club_id", "captured_at"),)

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collector_runs.id", ondelete="CASCADE"), nullable=False
    )
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    window_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )


class TournamentChange(UUIDPrimaryKeyMixin, Base):
    """Расхождение лобби с сеткой, которое решает человек: новый, пропавший, изменённый турнир.

    payload: для нового — турнир из лобби; для изменённого — {поле: {ours, lobby}}.
    """

    __tablename__ = "tournament_changes"
    __table_args__ = (Index("ix_tournament_changes_status_starts", "status", "starts_at"),)

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    tournament_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tournaments.id", ondelete="SET NULL")
    )
    kind: Mapped[TournamentChangeKind] = mapped_column(
        pg_enum(TournamentChangeKind, "tournament_change_kind"), nullable=False
    )
    status: Mapped[TournamentChangeStatus] = mapped_column(
        pg_enum(TournamentChangeStatus, "tournament_change_status"),
        nullable=False,
        server_default=TournamentChangeStatus.PENDING.value,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
