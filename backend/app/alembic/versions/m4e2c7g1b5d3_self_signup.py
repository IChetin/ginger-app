"""Ginger APP: самостоятельная регистрация с модерацией

Решение Ивана 24.09: человек заводит аккаунт сам, полный доступ даёт менеджер. Игроку —
статусы «на модерации» и «отказано», анкета новичка и отметка о том, кто рассмотрел.

Revision ID: m4e2c7g1b5d3
Revises: l3d1b6f0a4c2
Create Date: 2026-09-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "m4e2c7g1b5d3"
# После ручных записей в ленте (l3d1b6f0a4c2).
down_revision: str | None = "l3d1b6f0a4c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE player_status ADD VALUE IF NOT EXISTS 'pending'")
    op.execute("ALTER TYPE player_status ADD VALUE IF NOT EXISTS 'rejected'")
    # Уведомления: менеджеру о новичке, игроку — об открытии доступа.
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_player'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'player_approved'")
    op.add_column("players", sa.Column("play_nickname", sa.String(length=64), nullable=True))
    op.add_column("players", sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "players",
        sa.Column(
            "moderated_by_user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("players", "moderated_by_user_id")
    op.drop_column("players", "moderated_at")
    op.drop_column("players", "play_nickname")
    # Значения enum в Postgres не удаляются поштучно — тип остаётся расширенным.
