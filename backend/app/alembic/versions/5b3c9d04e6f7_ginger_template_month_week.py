"""Ginger APP: турниры месяца — «второе воскресенье», «последнее воскресенье»

Revision ID: 5b3c9d04e6f7
Revises: 4e1a7b93c5d2
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "5b3c9d04e6f7"
down_revision: str | None = "4e1a7b93c5d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tournament_templates", sa.Column("month_week", sa.SmallInteger()))
    op.create_check_constraint(
        "month_week_range",
        "tournament_templates",
        "month_week IS NULL OR month_week IN (-1, 1, 2, 3, 4, 5)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_tournament_templates_month_week_range", "tournament_templates", type_="check"
    )
    op.drop_column("tournament_templates", "month_week")
