"""users.timezone nullable IANA

Revision ID: i5e1a3b60c94
Revises: h4d0f2a59b83
Create Date: 2026-07-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "i5e1a3b60c94"
down_revision: str | None = "h4d0f2a59b83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=True,
            comment="IANA timezone; NULL = detect from browser",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
