"""password auth and email tokens

Revision ID: b4c5d6e7f8a9
Revises: a3b1c2d4e5f6
Create Date: 2026-07-26 15:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | None = "a3b1c2d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

auth_token_purpose = postgresql.ENUM(
    "email_verify",
    "password_reset",
    "login_attempt",
    name="auth_token_purpose",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        "CREATE TYPE auth_token_purpose AS ENUM ('email_verify', 'password_reset', 'login_attempt')"
    )
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Existing OTP users already proved inbox ownership.
    op.execute("UPDATE users SET email_verified_at = COALESCE(created_at, now())")

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", auth_token_purpose, nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("request_ip_hash", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_auth_tokens_user_purpose_created_at",
        "auth_tokens",
        ["user_id", "purpose", "created_at"],
        unique=False,
    )
    op.create_index("ix_auth_tokens_token_hash", "auth_tokens", ["token_hash"], unique=False)
    op.create_index(
        "ix_auth_tokens_request_ip_hash_created_at",
        "auth_tokens",
        ["request_ip_hash", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_auth_tokens_request_ip_hash_created_at", table_name="auth_tokens")
    op.drop_index("ix_auth_tokens_token_hash", table_name="auth_tokens")
    op.drop_index("ix_auth_tokens_user_purpose_created_at", table_name="auth_tokens")
    op.drop_table("auth_tokens")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "password_hash")
    op.execute("DROP TYPE auth_token_purpose")
