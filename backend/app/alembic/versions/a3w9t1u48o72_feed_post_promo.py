"""feed_posts.is_promo: акции клубов — запись ленты и отдельная вкладка рядом с MTT и CASH

Revision ID: a3w9t1u48o72
Revises: q8i6g1k5f9h7, a1w9t1u48o72
Create Date: 2026-09-29

Заодно сводит две головы: цепочку Ginger APP, по которой живёт прод, и ветку с историей
раздач. Разошлись они 29.09 в параллельных сессиях, и `alembic upgrade head` падал у всех.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3w9t1u48o72"
down_revision: str | Sequence[str] | None = ("q8i6g1k5f9h7", "a1w9t1u48o72")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "feed_posts",
        sa.Column("is_promo", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # Вкладка «Акции» просит только их и только живые — индекс по признаку и сроку показа.
    op.create_index(
        "ix_feed_posts_promo_published",
        "feed_posts",
        ["published_at"],
        postgresql_where=sa.text("is_promo"),
    )


def downgrade() -> None:
    op.drop_index("ix_feed_posts_promo_published", table_name="feed_posts")
    op.drop_column("feed_posts", "is_promo")
