"""otp_codes request_ip_hash for rate limit

Revision ID: b7c4e2a91f03
Revises: 953907ed750d
Create Date: 2026-07-18 21:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7c4e2a91f03"
down_revision: str | Sequence[str] | None = "953907ed750d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("otp_codes", sa.Column("request_ip_hash", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_otp_codes_request_ip_hash_created_at",
        "otp_codes",
        ["request_ip_hash", "created_at"],
        unique=False,
    )
    # Remove synthetic IP marker rows from stage-3 bridge.
    op.execute(sa.text("DELETE FROM otp_codes WHERE phone LIKE 'ip:%'"))


def downgrade() -> None:
    op.drop_index("ix_otp_codes_request_ip_hash_created_at", table_name="otp_codes")
    op.drop_column("otp_codes", "request_ip_hash")
