"""auth_tokens: register purpose, nullable user_id, email

Revision ID: m9i5e7f04a38
Revises: l8h4d6e93f27
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m9i5e7f04a38"
down_revision: str | None = "l8h4d6e93f27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE auth_token_purpose ADD VALUE IF NOT EXISTS 'register'")
    op.execute("ALTER TYPE auth_token_purpose ADD VALUE IF NOT EXISTS 'account_lookup'")

    op.alter_column("auth_tokens", "user_id", existing_type=sa.UUID(), nullable=True)
    op.add_column("auth_tokens", sa.Column("email", sa.String(length=255), nullable=True))
    op.create_index(
        "ix_auth_tokens_email_purpose_created_at",
        "auth_tokens",
        ["email", "purpose", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_tokens_email_purpose_created_at", table_name="auth_tokens")
    op.drop_column("auth_tokens", "email")
    op.alter_column("auth_tokens", "user_id", existing_type=sa.UUID(), nullable=False)
    # Postgres cannot remove enum values safely; leave register/account_lookup in place.
