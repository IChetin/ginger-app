"""users.stack_display chips|bb for replayer

Revision ID: u7q3m5n82i16
Revises: t6p2l4m71h05
Create Date: 2026-08-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "u7q3m5n82i16"
down_revision: str | None = "t6p2l4m71h05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

stack_display = postgresql.ENUM("chips", "bb", name="stack_display", create_type=False)


def upgrade() -> None:
    op.execute("CREATE TYPE stack_display AS ENUM ('chips', 'bb')")
    op.add_column(
        "users",
        sa.Column(
            "stack_display",
            stack_display,
            nullable=False,
            server_default=sa.text("'chips'"),
            comment="Replayer stacks: chips or big blinds",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "stack_display")
    op.execute("DROP TYPE stack_display")
