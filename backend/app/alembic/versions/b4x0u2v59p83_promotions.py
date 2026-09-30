"""promotions: акции клубов единой плашкой (Иван, 30.09)

Условия союзов приходят афишами и постами; из них собирается структурная акция — клуб,
фонд, сроки, бай-ин, призы по местам, окна двойных очков. Записи ленты с признаком
акции остаются как были.

Revision ID: b4x0u2v59p83
Revises: a3w9t1u48o72
Create Date: 2026-09-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b4x0u2v59p83"
down_revision: str | None = "a3w9t1u48o72"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "promotions",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "club_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="leaderboard"),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("prize_fund", sa.Numeric(14, 2), nullable=True),
        sa.Column("prize_extra", sa.String(length=80), nullable=True),
        sa.Column(
            "currency_code", sa.String(length=8), sa.ForeignKey("currencies.code"), nullable=True
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence", sa.String(length=16), nullable=False, server_default="none"),
        sa.Column("game", sa.String(length=8), nullable=False, server_default="mtt"),
        sa.Column("buyin_min", sa.Numeric(14, 2), nullable=True),
        sa.Column("buyin_max", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "prizes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "boost_windows",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "image_attachment_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column(
            "uncertain",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "renewed_from_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("promotions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_promotions_live", "promotions", ["ends_at"], postgresql_where=sa.text("is_published")
    )
    op.create_index(
        "uq_promotions_renewed_from",
        "promotions",
        ["renewed_from_id"],
        unique=True,
        postgresql_where=sa.text("renewed_from_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_promotions_renewed_from", table_name="promotions")
    op.drop_index("ix_promotions_live", table_name="promotions")
    op.drop_table("promotions")
