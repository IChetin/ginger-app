"""Ginger APP: Editor's Pick — подборка турниров и столов

Решение Ивана 15.09: плашка сверху MTT и CASH с турнирами и столами, которые он считает
интересными своей аудитории, и объяснением по знаку (?).

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
        sa.Column("match", sa.String(160), nullable=False),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("kind IN ('mtt', 'cash')", name="ck_editor_picks_kind_known"),
    )
    op.create_index("ix_editor_picks_kind_sort", "editor_picks", ["kind", "sort_order"])


def downgrade() -> None:
    op.drop_index("ix_editor_picks_kind_sort", table_name="editor_picks")
    op.drop_table("editor_picks")
