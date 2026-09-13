"""organizers logo_data + logo_content_type

Revision ID: l8h4d6e93f27
Revises: k7g3c5d82e16
Create Date: 2026-07-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "l8h4d6e93f27"
down_revision: str | None = "k7g3c5d82e16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizers", sa.Column("logo_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "organizers",
        sa.Column("logo_content_type", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizers", "logo_content_type")
    op.drop_column("organizers", "logo_data")
