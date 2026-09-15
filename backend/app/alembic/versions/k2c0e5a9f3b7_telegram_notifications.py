"""Ginger APP: Telegram-бот как второй канал уведомлений

Решение Ивана 15.09: по умолчанию пуши; подключил Telegram — важное приходит в оба канала.
Очередь уведомлений получает канал доставки, игроку — привязка чата, ответ менеджера —
свой тип уведомления.

Revision ID: k2c0e5a9f3b7
Revises: k2c0a5e9f3b1
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "k2c0e5a9f3b7"
# После «подборок редакции» (k2c0a5e9f3b1).
down_revision: str | None = "k2c0a5e9f3b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CHANNEL = postgresql.ENUM("push", "telegram", name="notification_channel", create_type=False)


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'thread_reply'")
    _CHANNEL.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "notification_queue",
        sa.Column("channel", _CHANNEL, nullable=False, server_default="push"),
    )

    op.create_table(
        "telegram_links",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("chat_id", sa.BigInteger(), nullable=True),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("link_token_hash", sa.String(64), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_telegram_links_chat_id",
        "telegram_links",
        ["chat_id"],
        unique=True,
        postgresql_where=sa.text("chat_id IS NOT NULL"),
    )
    op.create_index("ix_telegram_links_token", "telegram_links", ["link_token_hash"])


def downgrade() -> None:
    op.drop_index("ix_telegram_links_token", table_name="telegram_links")
    op.drop_index("ix_telegram_links_chat_id", table_name="telegram_links")
    op.drop_table("telegram_links")
    op.drop_column("notification_queue", "channel")
    _CHANNEL.drop(op.get_bind(), checkfirst=True)
    # Значение 'thread_reply' в notification_type остаётся: Postgres не удаляет значения enum.
