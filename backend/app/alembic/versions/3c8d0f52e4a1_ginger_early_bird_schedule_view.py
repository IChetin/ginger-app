"""Ginger APP: Early Bird у турниров, вид расписания в профиле, символ USDT

Revision ID: 3c8d0f52e4a1
Revises: 2a7c9e41b3d0
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "3c8d0f52e4a1"
down_revision: str | None = "2a7c9e41b3d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("tournament_templates", "tournaments"):
        op.add_column(table, sa.Column("early_bird_players", sa.SmallInteger()))
    op.add_column(
        "users",
        sa.Column(
            "schedule_view", sa.String(16), nullable=False, server_default=sa.text("'cards'")
        ),
    )
    op.create_check_constraint(
        "schedule_view_known", "users", "schedule_view IN ('cards', 'table')"
    )
    # Игроку USDT — тот же доллар (решение Ивана 2026-09-13).
    op.execute("UPDATE currencies SET symbol = '$' WHERE code = 'USDT'")


def downgrade() -> None:
    op.execute("UPDATE currencies SET symbol = '₮' WHERE code = 'USDT'")
    op.drop_constraint("ck_users_schedule_view_known", "users", type_="check")
    op.drop_column("users", "schedule_view")
    for table in ("tournaments", "tournament_templates"):
        op.drop_column(table, "early_bird_players")
