"""import_jobs.file_timezone for schedule times in file

Revision ID: g3c9e1f48a72
Revises: b4c5d6e7f8a9
Create Date: 2026-07-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "g3c9e1f48a72"
down_revision: str | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("file_timezone", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("import_jobs", "file_timezone")
