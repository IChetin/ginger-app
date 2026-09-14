"""Ginger APP: имя турнира из лобби, доля баунти, Early Bird, джекпот

Решение Ивана 15.09: игроку показываем имя турнира из лобби приложения (его он и ищет),
имя с афиши остаётся в базе. Всё, что видно в лобби и продаёт турнир, тоже выводим.

Revision ID: g8d6c1f5a9b7
Revises: f7b5c0d4e8a6
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "g8d6c1f5a9b7"
down_revision: str | None = "f7b5c0d4e8a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("tournament_templates", "tournaments")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("lobby_name", sa.String(160), nullable=True))
        op.add_column(table, sa.Column("bounty_share", sa.SmallInteger(), nullable=True))
        op.add_column(table, sa.Column("early_bird_bonus", sa.String(64), nullable=True))
        op.add_column(table, sa.Column("early_bird_levels", sa.SmallInteger(), nullable=True))
        op.add_column(
            table,
            sa.Column("has_jackpot", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "has_jackpot")
        op.drop_column(table, "early_bird_levels")
        op.drop_column(table, "early_bird_bonus")
        op.drop_column(table, "bounty_share")
        op.drop_column(table, "lobby_name")
