"""import kind and blind structure sets

Revision ID: f2b8d0e35a47
Revises: e1a7c9d24f36
Create Date: 2026-07-19 12:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f2b8d0e35a47"
down_revision: str | None = "e1a7c9d24f36"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

import_kind = postgresql.ENUM("schedule", "structures", name="import_kind", create_type=False)


def upgrade() -> None:
    op.execute("CREATE TYPE import_kind AS ENUM ('schedule', 'structures')")
    op.add_column(
        "import_jobs",
        sa.Column(
            "import_kind",
            import_kind,
            nullable=False,
            server_default=sa.text("'schedule'"),
        ),
    )

    op.add_column(
        "blind_levels",
        sa.Column(
            "structure_set_label",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
    )
    op.drop_constraint("uq_blind_levels_event_id_level_no", "blind_levels", type_="unique")
    op.create_unique_constraint(
        "uq_blind_levels_event_set_level",
        "blind_levels",
        ["event_id", "structure_set_label", "level_no"],
    )
    op.create_index("ix_blind_levels_event_id", "blind_levels", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_blind_levels_event_id", table_name="blind_levels")
    op.drop_constraint("uq_blind_levels_event_set_level", "blind_levels", type_="unique")
    op.create_unique_constraint(
        "uq_blind_levels_event_id_level_no",
        "blind_levels",
        ["event_id", "level_no"],
    )
    op.drop_column("blind_levels", "structure_set_label")
    op.drop_column("import_jobs", "import_kind")
    op.execute("DROP TYPE import_kind")
