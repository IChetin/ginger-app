"""search pg_trgm indexes + notification_queue.read_at

Revision ID: j6f2b4c71d05
Revises: i5e1a3b60c94
Create Date: 2026-07-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "j6f2b4c71d05"
down_revision: str | None = "i5e1a3b60c94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_index(
        "ix_series_name_trgm",
        "series",
        ["name"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_organizers_name_trgm",
        "organizers",
        ["name"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_venues_name_trgm",
        "venues",
        ["name"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_venues_city_trgm",
        "venues",
        ["city"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"city": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_events_name_trgm",
        "events",
        ["name"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )

    op.add_column(
        "notification_queue",
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_notification_queue_user_status_sent_at",
        "notification_queue",
        ["user_id", "status", "sent_at"],
        unique=False,
    )
    op.create_index(
        "ix_notification_queue_user_unread",
        "notification_queue",
        ["user_id"],
        unique=False,
        postgresql_where=sa.text("status = 'sent' AND read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_queue_user_unread",
        table_name="notification_queue",
        postgresql_where=sa.text("status = 'sent' AND read_at IS NULL"),
    )
    op.drop_index("ix_notification_queue_user_status_sent_at", table_name="notification_queue")
    op.drop_column("notification_queue", "read_at")

    op.drop_index("ix_events_name_trgm", table_name="events", postgresql_using="gin")
    op.drop_index("ix_venues_city_trgm", table_name="venues", postgresql_using="gin")
    op.drop_index("ix_venues_name_trgm", table_name="venues", postgresql_using="gin")
    op.drop_index("ix_organizers_name_trgm", table_name="organizers", postgresql_using="gin")
    op.drop_index("ix_series_name_trgm", table_name="series", postgresql_using="gin")
