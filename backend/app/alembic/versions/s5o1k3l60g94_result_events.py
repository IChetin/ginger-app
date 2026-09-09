"""result_events chronology for tracker results

Revision ID: s5o1k3l60g94
Revises: r4n0j2k59f83
Create Date: 2026-08-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "s5o1k3l60g94"
down_revision: str | None = "r4n0j2k59f83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

live_event_type = postgresql.ENUM(
    "entry",
    "reentry",
    "note",
    name="live_event_type",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "result_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.CheckConstraint(
            "(type = 'note' AND text IS NOT NULL) OR "
            "(type IN ('entry', 'reentry') AND amount IS NOT NULL)",
            name=op.f("ck_result_events_type_payload"),
        ),
        sa.ForeignKeyConstraint(
            ["result_id"],
            ["results.id"],
            name=op.f("fk_result_events_result_id_results"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["currency_code"],
            ["currencies.code"],
            name=op.f("fk_result_events_currency_code_currencies"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_result_events")),
    )
    op.create_index(
        "ix_result_events_result_id_occurred_at",
        "result_events",
        ["result_id", "occurred_at"],
        unique=False,
    )

    # Backfill: 1 entry + (entries_count-1) reentries; optional note from results.note.
    op.execute(
        sa.text(
            """
            INSERT INTO result_events (id, result_id, type, amount, currency_code, text, occurred_at, created_at)
            SELECT
                gen_random_uuid(),
                r.id,
                'entry'::live_event_type,
                r.buyin,
                r.currency_code,
                NULL,
                (r.played_on::timestamp AT TIME ZONE 'UTC') + INTERVAL '12 hours',
                now()
            FROM results r
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO result_events (id, result_id, type, amount, currency_code, text, occurred_at, created_at)
            SELECT
                gen_random_uuid(),
                r.id,
                'reentry'::live_event_type,
                r.buyin,
                r.currency_code,
                NULL,
                (r.played_on::timestamp AT TIME ZONE 'UTC')
                    + INTERVAL '12 hours'
                    + (gs.i * INTERVAL '1 minute'),
                now()
            FROM results r
            CROSS JOIN LATERAL generate_series(1, GREATEST(r.entries_count - 1, 0)) AS gs(i)
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO result_events (id, result_id, type, amount, currency_code, text, occurred_at, created_at)
            SELECT
                gen_random_uuid(),
                r.id,
                'note'::live_event_type,
                NULL,
                NULL,
                LEFT(r.note, 500),
                (r.played_on::timestamp AT TIME ZONE 'UTC') + INTERVAL '12 hours 30 minutes',
                now()
            FROM results r
            WHERE r.note IS NOT NULL AND btrim(r.note) <> ''
            """
        )
    )

    # Prefer live_events chronology when a finished session points at the result.
    op.execute(
        sa.text(
            """
            DELETE FROM result_events re
            USING live_sessions ls
            WHERE re.result_id = ls.result_id
              AND ls.status = 'finished'
              AND ls.result_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM live_events le
                  WHERE le.session_id = ls.id AND le.deleted_at IS NULL
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO result_events (id, result_id, type, amount, currency_code, text, occurred_at, created_at)
            SELECT
                gen_random_uuid(),
                ls.result_id,
                le.type,
                le.amount,
                le.currency_code,
                le.text,
                le.occurred_at,
                le.created_at
            FROM live_sessions ls
            JOIN live_events le ON le.session_id = ls.id AND le.deleted_at IS NULL
            WHERE ls.status = 'finished'
              AND ls.result_id IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_result_events_result_id_occurred_at", table_name="result_events")
    op.drop_table("result_events")
