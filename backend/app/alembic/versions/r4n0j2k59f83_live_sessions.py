"""live_sessions + live_events for in-progress tournament tracking

Revision ID: r4n0j2k59f83
Revises: q3m9i1j48e72
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "r4n0j2k59f83"
down_revision: str | None = "q3m9i1j48e72"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

live_session_status = postgresql.ENUM(
    "active",
    "finished",
    "cancelled",
    name="live_session_status",
    create_type=False,
)
live_event_type = postgresql.ENUM(
    "entry",
    "reentry",
    "note",
    name="live_event_type",
    create_type=False,
)


def upgrade() -> None:
    live_session_status.create(op.get_bind(), checkfirst=True)
    live_event_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "live_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("flight_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("manual_name", sa.String(length=160), nullable=True),
        sa.Column("manual_venue", sa.String(length=160), nullable=True),
        sa.Column("manual_buyin", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("manual_currency", sa.CHAR(length=3), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            live_session_status,
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("place", sa.Integer(), nullable=True),
        sa.Column("field_size", sa.Integer(), nullable=True),
        sa.Column("payout", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.CheckConstraint(
            "(event_id IS NOT NULL) OR "
            "(manual_name IS NOT NULL AND manual_buyin IS NOT NULL AND manual_currency IS NOT NULL)",
            name=op.f("ck_live_sessions_linked_or_manual"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_live_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_live_sessions_event_id_events"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["flight_id"],
            ["flights.id"],
            name=op.f("fk_live_sessions_flight_id_flights"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["manual_currency"],
            ["currencies.code"],
            name=op.f("fk_live_sessions_manual_currency_currencies"),
        ),
        sa.ForeignKeyConstraint(
            ["result_id"],
            ["results.id"],
            name=op.f("fk_live_sessions_result_id_results"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_live_sessions")),
    )
    op.create_index(
        "ix_live_sessions_user_id_status",
        "live_sessions",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "uq_live_sessions_one_active",
        "live_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "live_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", live_event_type, nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency_code", sa.CHAR(length=3), nullable=True),
        sa.Column("text", sa.String(length=500), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(type = 'note' AND text IS NOT NULL) OR "
            "(type IN ('entry', 'reentry') AND amount IS NOT NULL)",
            name=op.f("ck_live_events_type_payload"),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["live_sessions.id"],
            name=op.f("fk_live_events_session_id_live_sessions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["currency_code"],
            ["currencies.code"],
            name=op.f("fk_live_events_currency_code_currencies"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_live_events")),
    )
    op.create_index(
        "ix_live_events_session_id_occurred_at",
        "live_events",
        ["session_id", "occurred_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_live_events_session_id_occurred_at", table_name="live_events")
    op.drop_table("live_events")
    op.drop_index("uq_live_sessions_one_active", table_name="live_sessions")
    op.drop_index("ix_live_sessions_user_id_status", table_name="live_sessions")
    op.drop_table("live_sessions")
    live_event_type.drop(op.get_bind(), checkfirst=True)
    live_session_status.drop(op.get_bind(), checkfirst=True)
