"""hands.series_id — привязка раздачи к серии целиком

Revision ID: a1w9t1u48o72
Revises: z2v8s0t37n61
Create Date: 2026-08-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1w9t1u48o72"
down_revision: str | None = "z2v8s0t37n61"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "hands",
        sa.Column("series_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_hands_series_id_series"),
        "hands",
        "series",
        ["series_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_hands_series_id",
        "hands",
        ["series_id"],
        unique=False,
        postgresql_where=sa.text("series_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_hands_event_xor_series",
        "hands",
        "event_id IS NULL OR series_id IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_hands_event_xor_series", "hands", type_="check")
    op.drop_index("ix_hands_series_id", table_name="hands")
    op.drop_constraint(op.f("fk_hands_series_id_series"), "hands", type_="foreignkey")
    op.drop_column("hands", "series_id")
