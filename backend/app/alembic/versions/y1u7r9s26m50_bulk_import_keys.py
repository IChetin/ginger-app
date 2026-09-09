"""bulk xlsx import: import_key on series/events, series guarantee, flights.level_minutes

Revision ID: y1u7r9s26m50
Revises: x0t6q8r15l49
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "y1u7r9s26m50"
down_revision: str | None = "x0t6q8r15l49"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE import_kind ADD VALUE IF NOT EXISTS 'bulk_xlsx'")

    op.add_column("series", sa.Column("import_key", sa.String(length=64), nullable=True))
    op.add_column(
        "series",
        sa.Column("guarantee", sa.Numeric(precision=14, scale=2), nullable=True),
    )
    op.add_column("series", sa.Column("guarantee_currency_code", sa.CHAR(length=3), nullable=True))
    op.create_foreign_key(
        "fk_series_guarantee_currency_code_currencies",
        "series",
        "currencies",
        ["guarantee_currency_code"],
        ["code"],
    )
    # Partial: rows imported before bulk upload keep import_key NULL and must not collide.
    op.create_index(
        "uq_series_import_key",
        "series",
        ["import_key"],
        unique=True,
        postgresql_where=sa.text("import_key IS NOT NULL"),
    )

    op.add_column("events", sa.Column("import_key", sa.String(length=64), nullable=True))
    op.create_index(
        "uq_events_series_id_import_key",
        "events",
        ["series_id", "import_key"],
        unique=True,
        postgresql_where=sa.text("import_key IS NOT NULL"),
    )

    op.add_column("flights", sa.Column("level_minutes", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("flights", "level_minutes")

    op.drop_index("uq_events_series_id_import_key", table_name="events")
    op.drop_column("events", "import_key")

    op.drop_index("uq_series_import_key", table_name="series")
    op.drop_constraint("fk_series_guarantee_currency_code_currencies", "series", type_="foreignkey")
    op.drop_column("series", "guarantee_currency_code")
    op.drop_column("series", "guarantee")
    op.drop_column("series", "import_key")
    # import_kind keeps 'bulk_xlsx': PostgreSQL cannot drop a single enum value.
