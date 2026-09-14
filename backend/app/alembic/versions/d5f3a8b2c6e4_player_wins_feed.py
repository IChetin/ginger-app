"""Ginger APP: выигрыши игроков для ленты

Этап 7 плана сборки: менеджер заносит выигрыши в админке, лента показывает их вместе
с главными турнирами и вечерними событиями клубов.

Revision ID: d5f3a8b2c6e4
Revises: c4e2f7a9b1d3
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d5f3a8b2c6e4"
down_revision: str | None = "c4e2f7a9b1d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "player_wins",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("players.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("player_nickname", sa.String(64), nullable=False),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("tournament_name", sa.String(160), nullable=False),
        sa.Column("place", sa.SmallInteger(), nullable=True),
        sa.Column("prize_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency_code", sa.String(8), sa.ForeignKey("currencies.code"), nullable=False),
        sa.Column("won_on", sa.Date(), nullable=False),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("prize_amount > 0", name="ck_player_wins_prize_positive"),
    )
    op.create_index("ix_player_wins_won_on", "player_wins", ["won_on"])


def downgrade() -> None:
    op.drop_index("ix_player_wins_won_on", table_name="player_wins")
    op.drop_table("player_wins")
