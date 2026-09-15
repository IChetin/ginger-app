"""Ginger APP: сборщик лобби — проходы, снимки, очередь решений; диплинк старта; Suprema

Решение Ивана 15.09: турниры и кэш-столы собирает телефон со скриптом, обходя лобби
клубов. Параметры турниров и диплинки применяются сами, новые и пропавшие турниры —
в очередь на решение в админке.

Revision ID: i0a8e3c7d1f9
Revises: h9e7d2f6b0c8
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "i0a8e3c7d1f9"
down_revision: str | None = "h9e7d2f6b0c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RUN_KIND = postgresql.ENUM("mtt", "cash", name="collector_run_kind", create_type=False)
_RUN_STATUS = postgresql.ENUM(
    "running", "ok", "failed", name="collector_run_status", create_type=False
)
_CHANGE_KIND = postgresql.ENUM(
    "new", "missing", "changed", name="tournament_change_kind", create_type=False
)
_CHANGE_STATUS = postgresql.ENUM(
    "pending", "applied", "dismissed", name="tournament_change_status", create_type=False
)
_POKER_APP = postgresql.ENUM(name="poker_app", create_type=False)
_NEW_ENUMS = (_RUN_KIND, _RUN_STATUS, _CHANGE_KIND, _CHANGE_STATUS)


def _uuid_pk() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def upgrade() -> None:
    op.execute("ALTER TYPE poker_app ADD VALUE IF NOT EXISTS 'suprema'")
    bind = op.get_bind()
    for enum in _NEW_ENUMS:
        enum.create(bind, checkfirst=True)

    op.add_column("tournaments", sa.Column("app_link", sa.String(500), nullable=True))

    op.create_table(
        "collector_runs",
        _uuid_pk(),
        sa.Column("kind", _RUN_KIND, nullable=False),
        sa.Column("app", _POKER_APP, nullable=False),
        sa.Column("status", _RUN_STATUS, nullable=False, server_default="running"),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "stats", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )
    op.create_index("ix_collector_runs_started_at", "collector_runs", ["started_at"])

    op.create_table(
        "collector_snapshots",
        _uuid_pk(),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("collector_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "captured_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("window_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_to", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "summary", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )
    op.create_index(
        "ix_collector_snapshots_club_captured", "collector_snapshots", ["club_id", "captured_at"]
    )

    op.create_table(
        "tournament_changes",
        _uuid_pk(),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tournament_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tournaments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", _CHANGE_KIND, nullable=False),
        sa.Column("status", _CHANGE_STATUS, nullable=False, server_default="pending"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolved_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_tournament_changes_status_starts", "tournament_changes", ["status", "starts_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_tournament_changes_status_starts", table_name="tournament_changes")
    op.drop_table("tournament_changes")
    op.drop_index("ix_collector_snapshots_club_captured", table_name="collector_snapshots")
    op.drop_table("collector_snapshots")
    op.drop_index("ix_collector_runs_started_at", table_name="collector_runs")
    op.drop_table("collector_runs")
    op.drop_column("tournaments", "app_link")
    bind = op.get_bind()
    for enum in reversed(_NEW_ENUMS):
        enum.drop(bind, checkfirst=True)
    # Значение 'suprema' в poker_app остаётся: Postgres не удаляет значения enum.
