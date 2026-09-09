"""events.start_blinds — стартовые блайнды из сетки расписания

Revision ID: d3a4b5c6e7f8
Revises: c2z3x5y82s16
Create Date: 2026-08-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d3a4b5c6e7f8"
down_revision: str | None = "c2z3x5y82s16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("start_blinds", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("events", "start_blinds")
