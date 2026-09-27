"""Ginger APP: автозаписи в «Новостях» о турнирах

Иван, 27.09: каждый старт турнира из Editor's Pick попадает в новости сам, а если сегодня
таких нет — случайный Major. Запись привязана к турниру: одна на старт.

Revision ID: p7h5f0j4e8g6
Revises: o6g4e9i3d7f5
Create Date: 2026-09-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "p7h5f0j4e8g6"
# После отмены заявок игроком (o6g4e9i3d7f5).
down_revision: str | None = "o6g4e9i3d7f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "feed_posts",
        sa.Column(
            "tournament_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("tournaments.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column("feed_posts", sa.Column("auto_kind", sa.String(length=16), nullable=True))
    op.create_index(
        "uq_feed_posts_tournament_id",
        "feed_posts",
        ["tournament_id"],
        unique=True,
        postgresql_where=sa.text("tournament_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_feed_posts_tournament_id", table_name="feed_posts")
    op.drop_column("feed_posts", "auto_kind")
    op.drop_column("feed_posts", "tournament_id")
