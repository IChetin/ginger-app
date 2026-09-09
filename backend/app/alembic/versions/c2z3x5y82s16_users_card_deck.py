"""users.card_deck classic|four_color for playing-card suits

Revision ID: c2z3x5y82s16
Revises: a1w9t1u48o72
Create Date: 2026-08-25
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c2z3x5y82s16"
down_revision: str | None = "a1w9t1u48o72"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

card_deck = postgresql.ENUM("classic", "four_color", name="card_deck", create_type=False)


def upgrade() -> None:
    op.execute("CREATE TYPE card_deck AS ENUM ('classic', 'four_color')")
    op.add_column(
        "users",
        sa.Column(
            "card_deck",
            card_deck,
            nullable=False,
            server_default=sa.text("'four_color'"),
            comment="Playing-card suit colors: classic two-color or four-color",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "card_deck")
    op.execute("DROP TYPE card_deck")
