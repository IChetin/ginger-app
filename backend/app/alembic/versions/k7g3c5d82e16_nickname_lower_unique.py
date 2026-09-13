"""nickname unique by lower() (case-insensitive)

Revision ID: k7g3c5d82e16
Revises: j6f2b4c71d05
Create Date: 2026-07-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "k7g3c5d82e16"
down_revision: str | None = "j6f2b4c71d05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("uq_users_nickname"), "users", type_="unique")
    op.execute("CREATE UNIQUE INDEX uq_users_nickname_lower ON users (lower(nickname))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_nickname_lower")
    op.create_unique_constraint(op.f("uq_users_nickname"), "users", ["nickname"])
