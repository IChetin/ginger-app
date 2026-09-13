"""Ginger APP: треды с менеджером

Этап 6 плана сборки: обращения по темам со статусами, картинки и истории раздач,
автозакрытие после 14 дней тишины, пуш менеджерам о новом сообщении.

Revision ID: b19c536ae2f3
Revises: a08b4259d1e2
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b19c536ae2f3"
down_revision: str | None = "a08b4259d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

thread_topic = postgresql.ENUM(
    "question", "hand_review", "data_change", "chip_request", name="thread_topic", create_type=False
)
thread_status = postgresql.ENUM(
    "open", "answered", "closed", name="thread_status", create_type=False
)


def _uuid(
    name: str, target: str | None = None, ondelete: str = "CASCADE", **kw: object
) -> sa.Column:
    args: list[object] = [name, postgresql.UUID(as_uuid=True)]
    if target:
        args.append(sa.ForeignKey(target, ondelete=ondelete))
    return sa.Column(*args, **kw)  # type: ignore[arg-type]


def _ts(name: str, **kw: object) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), **kw)  # type: ignore[arg-type]


def upgrade() -> None:
    bind = op.get_bind()
    thread_topic.create(bind, checkfirst=True)
    thread_status.create(bind, checkfirst=True)
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_thread_message'")

    op.create_table(
        "threads",
        _uuid("id", primary_key=True, server_default=sa.text("gen_random_uuid()")),
        _uuid("player_id", "players.id", nullable=False),
        sa.Column("topic", thread_topic, nullable=False),
        sa.Column("status", thread_status, nullable=False, server_default="open"),
        sa.Column("subject", sa.String(120), nullable=False),
        _uuid("chip_request_id", "chip_requests.id", ondelete="SET NULL", nullable=True),
        _uuid("assignee_user_id", "users.id", ondelete="SET NULL", nullable=True),
        _ts("last_message_at", nullable=False),
        sa.Column("last_message_preview", sa.String(160), nullable=True),
        _ts("last_player_message_at", nullable=True),
        _ts("last_manager_message_at", nullable=True),
        _ts("player_last_read_at", nullable=True),
        _ts("manager_last_read_at", nullable=True),
        _ts("closed_at", nullable=True),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        _ts("updated_at", nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_threads_player_id", "threads", ["player_id"])
    op.create_index("ix_threads_status_last_message_at", "threads", ["status", "last_message_at"])
    op.create_index(
        "uq_threads_chip_request_id",
        "threads",
        ["chip_request_id"],
        unique=True,
        postgresql_where=sa.text("chip_request_id IS NOT NULL"),
    )

    op.create_table(
        "thread_messages",
        _uuid("id", primary_key=True, server_default=sa.text("gen_random_uuid()")),
        _uuid("thread_id", "threads.id", nullable=False),
        _uuid("author_user_id", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("from_manager", sa.Boolean(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        _uuid("attachment_id", "attachments.id", ondelete="SET NULL", nullable=True),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_thread_messages_thread_id_created_at", "thread_messages", ["thread_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_thread_messages_thread_id_created_at", table_name="thread_messages")
    op.drop_table("thread_messages")
    op.drop_index("uq_threads_chip_request_id", table_name="threads")
    op.drop_index("ix_threads_status_last_message_at", table_name="threads")
    op.drop_index("ix_threads_player_id", table_name="threads")
    op.drop_table("threads")
    bind = op.get_bind()
    thread_status.drop(bind, checkfirst=True)
    thread_topic.drop(bind, checkfirst=True)
    # Значение new_thread_message в notification_type остаётся: Postgres не удаляет значения enum.
