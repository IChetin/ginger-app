"""users.hand_input_mode wizard|table for hand input shell

Revision ID: x0t6q8r15l49
Revises: w9s5p7q04k38
Create Date: 2026-08-21
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "x0t6q8r15l49"
down_revision: str | None = "w9s5p7q04k38"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

hand_input_mode = postgresql.ENUM("wizard", "table", name="hand_input_mode", create_type=False)


def upgrade() -> None:
    op.execute("CREATE TYPE hand_input_mode AS ENUM ('wizard', 'table')")
    op.add_column(
        "users",
        sa.Column(
            "hand_input_mode",
            hand_input_mode,
            nullable=False,
            server_default=sa.text("'table'"),
            comment="Hand input shell: wizard or table",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "hand_input_mode")
    op.execute("DROP TYPE hand_input_mode")
