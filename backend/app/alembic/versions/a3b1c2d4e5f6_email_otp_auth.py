"""email otp auth

Revision ID: a3b1c2d4e5f6
Revises: f2b8d0e35a47
Create Date: 2026-07-21 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3b1c2d4e5f6"
down_revision: str | None = "f2b8d0e35a47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Destructive reset: project has no production auth data yet.
    op.execute("DELETE FROM otp_codes")
    op.execute("DELETE FROM sessions")
    op.execute("UPDATE change_log SET actor_id = NULL WHERE actor_id IS NOT NULL")
    op.execute("DELETE FROM import_jobs")
    op.execute("DELETE FROM users")

    op.drop_index("ix_otp_codes_phone_created_at", table_name="otp_codes")
    op.alter_column(
        "otp_codes",
        "phone",
        new_column_name="email",
        existing_type=sa.String(length=16),
        type_=sa.String(length=255),
        existing_nullable=False,
        nullable=False,
    )
    op.create_index(
        "ix_otp_codes_email_created_at",
        "otp_codes",
        ["email", "created_at"],
        unique=False,
    )

    op.drop_column("users", "email")
    op.drop_constraint("uq_users_phone", "users", type_="unique")
    op.alter_column(
        "users",
        "phone",
        new_column_name="email",
        existing_type=sa.String(length=16),
        type_=sa.String(length=255),
        existing_nullable=False,
        nullable=False,
    )
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.add_column(
        "users",
        sa.Column(
            "phone",
            sa.String(length=16),
            nullable=True,
            comment="Optional contact phone reserved for phase 3",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "phone")
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.alter_column(
        "users",
        "email",
        new_column_name="phone",
        existing_type=sa.String(length=255),
        type_=sa.String(length=16),
        existing_nullable=False,
        nullable=False,
    )
    op.create_unique_constraint("uq_users_phone", "users", ["phone"])
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))

    op.drop_index("ix_otp_codes_email_created_at", table_name="otp_codes")
    op.alter_column(
        "otp_codes",
        "email",
        new_column_name="phone",
        existing_type=sa.String(length=255),
        type_=sa.String(length=16),
        existing_nullable=False,
        nullable=False,
    )
    op.create_index(
        "ix_otp_codes_phone_created_at",
        "otp_codes",
        ["phone", "created_at"],
        unique=False,
    )
