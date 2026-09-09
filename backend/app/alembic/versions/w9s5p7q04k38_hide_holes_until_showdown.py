"""users.hide_holes_until_showdown for replayer

Revision ID: w9s5p7q04k38
Revises: v8r4n6o93j27
Create Date: 2026-08-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "w9s5p7q04k38"
down_revision: str | None = "v8r4n6o93j27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "hide_holes_until_showdown",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Replayer: hide opponent holes until showdown",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "hide_holes_until_showdown")
