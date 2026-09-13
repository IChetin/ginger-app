"""Ginger APP: колокольчик на турнире

Напоминание за 5 минут до старта и до конца поздней регистрации (ответ 11.7). Пуш в очереди
ссылается на напоминание с каскадным удалением: снятый колокольчик и удалённый турнир не
присылают лишнего.

Revision ID: a08b4259d1e2
Revises: 9f7a3148c0d1
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a08b4259d1e2"
down_revision: str | None = "9f7a3148c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

reminder_kind = postgresql.ENUM("start", "late_reg", name="reminder_kind", create_type=False)


def upgrade() -> None:
    reminder_kind.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "tournament_reminders",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tournament_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tournaments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", reminder_kind, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "user_id", "tournament_id", "kind", name="uq_tournament_reminders_user_tournament_kind"
        ),
    )
    op.create_index(
        "ix_tournament_reminders_tournament_id", "tournament_reminders", ["tournament_id"]
    )
    op.add_column(
        "notification_queue",
        sa.Column(
            "tournament_reminder_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tournament_reminders.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_notification_queue_tournament_reminder_id",
        "notification_queue",
        ["tournament_reminder_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_queue_tournament_reminder_id", table_name="notification_queue")
    op.drop_column("notification_queue", "tournament_reminder_id")
    op.drop_index("ix_tournament_reminders_tournament_id", table_name="tournament_reminders")
    op.drop_table("tournament_reminders")
    reminder_kind.drop(op.get_bind(), checkfirst=True)
