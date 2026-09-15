"""Ginger APP: Editor's Pick — отбор турниров и кэш-лимитов для фильтра

Решение Ивана 15.09: «★ Editor's Pick» — ещё один фильтр на MTT и CASH, в выдачу попадает
только отобранное. MTT — клуб и часть названия, CASH — клуб, игра и лимит.

Revision ID: k2c0a5e9f3b1
Revises: j1b9f4d8e2a0
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "k2c0a5e9f3b1"
down_revision: str | None = "j1b9f4d8e2a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GAME_TYPE = postgresql.ENUM(name="game_type", create_type=False)


def upgrade() -> None:
    op.create_table(
        "editor_picks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("match", sa.String(160), nullable=True),
        sa.Column("game_type", _GAME_TYPE, nullable=True),
        sa.Column("big_blind", sa.Numeric(12, 2), nullable=True),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "(kind = 'mtt' AND match IS NOT NULL) OR (kind = 'cash' AND game_type IS NOT NULL)",
            name="ck_editor_picks_target_complete",
        ),
    )
    op.create_index("ix_editor_picks_kind_sort", "editor_picks", ["kind", "sort_order"])


def downgrade() -> None:
    op.drop_index("ix_editor_picks_kind_sort", table_name="editor_picks")
    op.drop_table("editor_picks")
