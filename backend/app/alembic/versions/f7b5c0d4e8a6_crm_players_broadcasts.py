"""Ginger APP: mini-CRM — поля карточки игрока и ручные рассылки

Этап 9 плана сборки (ТЗ §9а.3): имя, Telegram, канал привлечения и теги в карточке игрока;
журнал рассылок из админки и тип пуша «рассылка».

Revision ID: f7b5c0d4e8a6
Revises: e6a4b9c3d7f5
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f7b5c0d4e8a6"
down_revision: str | None = "e6a4b9c3d7f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("players", sa.Column("real_name", sa.String(120), nullable=True))
    op.add_column("players", sa.Column("telegram", sa.String(64), nullable=True))
    op.add_column("players", sa.Column("source", sa.String(64), nullable=True))
    op.add_column(
        "players",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String(32)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
    )
    op.create_index("ix_players_tags", "players", ["tags"], postgresql_using="gin")

    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'broadcast'")

    op.create_table(
        "broadcasts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("body", sa.String(300), nullable=False),
        sa.Column("url", sa.String(200), nullable=False),
        sa.Column("segment", postgresql.JSONB(), nullable=False),
        sa.Column("recipients", sa.Integer(), nullable=False),
        sa.Column("pushes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_broadcasts_created_at", "broadcasts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_broadcasts_created_at", table_name="broadcasts")
    op.drop_table("broadcasts")
    op.drop_index("ix_players_tags", table_name="players")
    for column in ("tags", "source", "telegram", "real_name"):
        op.drop_column("players", column)
    # Значение 'broadcast' в notification_type остаётся: Postgres не удаляет значения enum.
