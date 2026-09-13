"""Ginger APP: личная реферальная ссылка игрока

Решение Ивана по вопросу 11.8 (2026-09-13): у каждого игрока многоразовая бессрочная ссылка
и QR, по ним друг регистрируется без одобрения. Код выдаётся при первом открытии экрана
«Пригласить», поэтому столбец допускает NULL.

Revision ID: 9f7a3148c0d1
Revises: 8e6f2037b9c0
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9f7a3148c0d1"
down_revision: str | None = "8e6f2037b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("players", sa.Column("referral_code", sa.String(length=16), nullable=True))
    op.create_index("uq_players_referral_code", "players", ["referral_code"], unique=True)
    op.create_index("ix_players_referrer_player_id", "players", ["referrer_player_id"])


def downgrade() -> None:
    op.drop_index("ix_players_referrer_player_id", table_name="players")
    op.drop_index("uq_players_referral_code", table_name="players")
    op.drop_column("players", "referral_code")
