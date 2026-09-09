"""events: buyin_bounty, day_end_note

Revision ID: n0j6f8g15b49
Revises: m9i5e7f04a38
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n0j6f8g15b49"
down_revision: str | None = "m9i5e7f04a38"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("buyin_bounty", sa.Numeric(precision=12, scale=2), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("day_end_note", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("events", "day_end_note")
    op.drop_column("events", "buyin_bounty")
