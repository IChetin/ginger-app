"""Ginger APP: автоновости больше не исчезают

Иван, 27.09: новости не должны пропадать с закрытием регистрации — старые уходят вниз и
вытесняются свежими. Снимаем срок у уже созданных автозаписей; удалённые менеджером
(срок равен моменту публикации) остаются скрытыми.

Revision ID: q8i6g1k5f9h7
Revises: p7h5f0j4e8g6
Create Date: 2026-09-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "q8i6g1k5f9h7"
down_revision: str | None = "p7h5f0j4e8g6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE feed_posts SET expires_at = NULL "
        "WHERE auto_kind IS NOT NULL AND expires_at IS DISTINCT FROM published_at"
    )


def downgrade() -> None:
    # Прежние сроки не сохраняли — откатывать нечего.
    pass
