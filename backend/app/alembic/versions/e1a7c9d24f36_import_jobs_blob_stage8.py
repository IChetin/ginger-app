"""import_jobs blob storage and accounting stage8

Revision ID: e1a7c9d24f36
Revises: d9e6a4c13b25
Create Date: 2026-07-19 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e1a7c9d24f36"
down_revision: str | Sequence[str] | None = "d9e6a4c13b25"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("original_filename", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "import_jobs",
        sa.Column("content_type", sa.String(length=128), nullable=True),
    )
    op.add_column("import_jobs", sa.Column("file_size", sa.BigInteger(), nullable=True))
    op.add_column(
        "import_jobs",
        sa.Column("file_sha256", sa.String(length=64), nullable=True),
    )
    op.add_column("import_jobs", sa.Column("file_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "import_jobs",
        sa.Column("estimated_cost_usd", sa.Numeric(precision=12, scale=6), nullable=True),
    )
    op.add_column("import_jobs", sa.Column("fields_total", sa.Integer(), nullable=True))
    op.add_column("import_jobs", sa.Column("fields_corrected", sa.Integer(), nullable=True))
    op.add_column(
        "import_jobs",
        sa.Column("initial_draft", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # Dev/test tables are empty or only contain factory stubs; drop legacy path storage.
    op.execute(
        sa.text(
            """
            UPDATE import_jobs
            SET
              original_filename = COALESCE(original_filename, split_part(file_path, '/', -1)),
              content_type = COALESCE(content_type, 'application/octet-stream'),
              file_size = COALESCE(file_size, 0),
              file_sha256 = COALESCE(
                file_sha256,
                repeat('0', 64)
              ),
              file_data = COALESCE(file_data, ''::bytea)
            """
        )
    )

    op.alter_column("import_jobs", "original_filename", nullable=False)
    op.alter_column("import_jobs", "content_type", nullable=False)
    op.alter_column("import_jobs", "file_size", nullable=False)
    op.alter_column("import_jobs", "file_sha256", nullable=False)
    op.alter_column("import_jobs", "file_data", nullable=False)
    op.drop_column("import_jobs", "file_path")
    op.create_index("ix_import_jobs_status_created_at", "import_jobs", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_import_jobs_status_created_at", table_name="import_jobs")
    op.add_column("import_jobs", sa.Column("file_path", sa.Text(), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE import_jobs
            SET file_path = COALESCE(original_filename, 'unknown')
            """
        )
    )
    op.alter_column("import_jobs", "file_path", nullable=False)
    op.drop_column("import_jobs", "initial_draft")
    op.drop_column("import_jobs", "fields_corrected")
    op.drop_column("import_jobs", "fields_total")
    op.drop_column("import_jobs", "estimated_cost_usd")
    op.drop_column("import_jobs", "file_data")
    op.drop_column("import_jobs", "file_sha256")
    op.drop_column("import_jobs", "file_size")
    op.drop_column("import_jobs", "content_type")
    op.drop_column("import_jobs", "original_filename")
