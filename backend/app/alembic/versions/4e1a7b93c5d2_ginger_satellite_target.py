"""Ginger APP: цель сателлита — показываем «Sat → турнир»

Revision ID: 4e1a7b93c5d2
Revises: 3c8d0f52e4a1
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "4e1a7b93c5d2"
down_revision: str | None = "3c8d0f52e4a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("tournament_templates", "tournaments"):
        op.add_column(table, sa.Column("satellite_target", sa.String(160)))


def downgrade() -> None:
    for table in ("tournaments", "tournament_templates"):
        op.drop_column(table, "satellite_target")
