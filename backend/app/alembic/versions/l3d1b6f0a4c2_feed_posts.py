"""Ginger APP: ручные записи в ленте

Лента собирается из расписания и выигрышей — записи менеджера добавляют туда то, что
раньше уходило постом в Telegram: анонсы, афиши, итоги вторника.

Revision ID: l3d1b6f0a4c2
Revises: k2c0e5a9f3b7
Create Date: 2026-09-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "l3d1b6f0a4c2"
# После Telegram-бота (k2c0e5a9f3b7).
down_revision: str | None = "k2c0e5a9f3b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feed_posts",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link_url", sa.String(length=200), nullable=True),
        sa.Column("link_label", sa.String(length=40), nullable=True),
        sa.Column(
            "image_attachment_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "club_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_feed_posts_published_at", "feed_posts", ["published_at"])


def downgrade() -> None:
    op.drop_index("ix_feed_posts_published_at", table_name="feed_posts")
    op.drop_table("feed_posts")
