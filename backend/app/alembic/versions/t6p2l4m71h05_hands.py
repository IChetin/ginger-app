"""hands table for replayer JSON documents

Revision ID: t6p2l4m71h05
Revises: s5o1k3l60g94
Create Date: 2026-08-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "t6p2l4m71h05"
down_revision: str | None = "s5o1k3l60g94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hands",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=12), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("live_session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "is_public",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "views_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_hands_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_hands_event_id_events"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["live_session_id"],
            ["live_sessions.id"],
            name=op.f("fk_hands_live_session_id_live_sessions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hands")),
    )
    op.create_index("uq_hands_slug", "hands", ["slug"], unique=True)
    op.create_index(
        "ix_hands_user_id_created_at",
        "hands",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_hands_event_id",
        "hands",
        ["event_id"],
        unique=False,
        postgresql_where=sa.text("event_id IS NOT NULL"),
    )
    op.create_index(
        "ix_hands_note_trgm",
        "hands",
        ["note"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"note": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_hands_note_trgm", table_name="hands")
    op.drop_index("ix_hands_event_id", table_name="hands")
    op.drop_index("ix_hands_user_id_created_at", table_name="hands")
    op.drop_index("uq_hands_slug", table_name="hands")
    op.drop_table("hands")
