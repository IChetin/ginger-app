"""bookmarks default offsets and queue bookmark_id

Revision ID: c8d5f3b02a14
Revises: b7c4e2a91f03
Create Date: 2026-07-18 21:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c8d5f3b02a14"
down_revision: str | Sequence[str] | None = "b7c4e2a91f03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "default_reminder_offsets",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{1440,120}'::integer[]"),
            nullable=False,
        ),
    )
    op.add_column(
        "notification_queue",
        sa.Column("bookmark_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_notification_queue_bookmark_id_bookmarks"),
        "notification_queue",
        "bookmarks",
        ["bookmark_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_notification_queue_bookmark_id",
        "notification_queue",
        ["bookmark_id"],
        unique=False,
    )
    op.create_index(
        "uq_notification_queue_reminder_bookmark_scheduled_at",
        "notification_queue",
        ["bookmark_id", "scheduled_at"],
        unique=True,
        postgresql_where=sa.text("type = 'reminder' AND bookmark_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_notification_queue_reminder_bookmark_scheduled_at",
        table_name="notification_queue",
    )
    op.drop_index("ix_notification_queue_bookmark_id", table_name="notification_queue")
    op.drop_constraint(
        op.f("fk_notification_queue_bookmark_id_bookmarks"),
        "notification_queue",
        type_="foreignkey",
    )
    op.drop_column("notification_queue", "bookmark_id")
    op.drop_column("users", "default_reminder_offsets")
