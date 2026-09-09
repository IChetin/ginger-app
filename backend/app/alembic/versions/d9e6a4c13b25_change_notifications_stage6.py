"""change notifications stage6: series_cancelled + change_log_id

Revision ID: d9e6a4c13b25
Revises: c8d5f3b02a14
Create Date: 2026-07-19 01:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d9e6a4c13b25"
down_revision: str | Sequence[str] | None = "c8d5f3b02a14"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PG requires enum values committed before they can be used in the same migration.
    with op.get_context().autocommit_block():
        op.execute(
            sa.text("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'series_cancelled'")
        )

    op.add_column(
        "notification_queue",
        sa.Column("change_log_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_notification_queue_change_log_id_change_log"),
        "notification_queue",
        "change_log",
        ["change_log_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_notification_queue_change_log_id",
        "notification_queue",
        ["change_log_id"],
        unique=False,
    )
    op.create_index(
        "uq_notification_queue_change_log_user_type",
        "notification_queue",
        ["change_log_id", "user_id", "type"],
        unique=True,
        postgresql_where=sa.text("change_log_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_notification_queue_change_log_user_type",
        table_name="notification_queue",
    )
    op.drop_index("ix_notification_queue_change_log_id", table_name="notification_queue")
    op.drop_constraint(
        op.f("fk_notification_queue_change_log_id_change_log"),
        "notification_queue",
        type_="foreignkey",
    )
    op.drop_column("notification_queue", "change_log_id")
    # PostgreSQL cannot remove enum values safely; leave series_cancelled in place.
