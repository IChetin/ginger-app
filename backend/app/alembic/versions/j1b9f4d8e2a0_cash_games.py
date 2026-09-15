"""Ginger APP: кэш-игры из лобби клубов — игра, лимит, число столов

Решение Ивана 15.09: вечером (18:00–02:00) сборщик раз в 15–20 минут снимает список
кэш-столов в отобранных клубах. Игроку — игра, лимит и сколько столов открыто.

Revision ID: j1b9f4d8e2a0
Revises: i0a8e3c7d1f9
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "j1b9f4d8e2a0"
down_revision: str | None = "i0a8e3c7d1f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GAME_TYPE = postgresql.ENUM(name="game_type", create_type=False)


def upgrade() -> None:
    op.create_table(
        "cash_games",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("game_type", _GAME_TYPE, nullable=False),
        sa.Column("small_blind", sa.Numeric(12, 2), nullable=False),
        sa.Column("big_blind", sa.Numeric(12, 2), nullable=False),
        sa.Column("tables", sa.SmallInteger(), nullable=False),
        sa.Column("app_link", sa.String(500), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "club_id", "game_type", "small_blind", "big_blind", name="uq_cash_games_club_limit"
        ),
        sa.CheckConstraint(
            "big_blind > 0 AND small_blind >= 0 AND tables > 0",
            name="ck_cash_games_values_positive",
        ),
    )
    op.create_index("ix_cash_games_seen_at", "cash_games", ["seen_at"])


def downgrade() -> None:
    op.drop_index("ix_cash_games_seen_at", table_name="cash_games")
    op.drop_table("cash_games")
