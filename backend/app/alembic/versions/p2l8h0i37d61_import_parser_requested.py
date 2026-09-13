"""import_jobs: parser_requested

Revision ID: p2l8h0i37d61
Revises: o1k7g9h26c50
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "p2l8h0i37d61"
down_revision: str | None = "o1k7g9h26c50"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("parser_requested", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("import_jobs", "parser_requested")
