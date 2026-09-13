"""hands.status / current_step / nullable slug for drafts

Revision ID: v8r4n6o93j27
Revises: u7q3m5n82i16
Create Date: 2026-08-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "v8r4n6o93j27"
down_revision: str | None = "u7q3m5n82i16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

hand_status = postgresql.ENUM(
    "draft",
    "published",
    name="hand_status",
    create_type=False,
)


def upgrade() -> None:
    hand_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "hands",
        sa.Column(
            "status",
            hand_status,
            nullable=False,
            server_default=sa.text("'published'"),
        ),
    )
    op.add_column(
        "hands",
        sa.Column("current_step", sa.SmallInteger(), nullable=True),
    )
    op.alter_column("hands", "slug", existing_type=sa.String(length=12), nullable=True)
    op.drop_index("uq_hands_slug", table_name="hands")
    op.create_index(
        "uq_hands_slug",
        "hands",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("slug IS NOT NULL"),
    )
    op.create_index(
        "ix_hands_user_id_status_updated_at",
        "hands",
        ["user_id", "status", "updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_hands_user_id_drafts",
        "hands",
        ["user_id"],
        unique=False,
        postgresql_where=sa.text("status = 'draft'"),
    )
    op.create_check_constraint(
        "ck_hands_hand_status_shape",
        "hands",
        "(status = 'published' AND slug IS NOT NULL AND current_step IS NULL) "
        "OR (status = 'draft' AND slug IS NULL AND is_public = false "
        "AND current_step BETWEEN 1 AND 4)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_hands_hand_status_shape", "hands", type_="check")
    op.drop_index("ix_hands_user_id_drafts", table_name="hands")
    op.drop_index("ix_hands_user_id_status_updated_at", table_name="hands")
    op.drop_index("uq_hands_slug", table_name="hands")
    op.execute("DELETE FROM hands WHERE slug IS NULL")
    op.alter_column("hands", "slug", existing_type=sa.String(length=12), nullable=False)
    op.create_index("uq_hands_slug", "hands", ["slug"], unique=True)
    op.drop_column("hands", "current_step")
    op.drop_column("hands", "status")
    hand_status.drop(op.get_bind(), checkfirst=True)
