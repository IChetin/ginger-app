"""Ginger APP: путь в живые серии — турнир относится к живому событию

Решение Ивана 15.09: он-офф турниры X-Poker (STEP-сателлиты в живые серии и сами турниры
серии) не смешиваются с онлайн-расписанием, а живут отдельным блоком LIVE.

Revision ID: h9e7d2f6b0c8
Revises: g8d6c1f5a9b7
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "h9e7d2f6b0c8"
down_revision: str | None = "g8d6c1f5a9b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("tournament_templates", "tournaments")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("live_event", sa.String(160), nullable=True))
        op.add_column(table, sa.Column("live_dates", sa.String(64), nullable=True))
        op.add_column(table, sa.Column("live_step", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "live_step")
        op.drop_column(table, "live_dates")
        op.drop_column(table, "live_event")
