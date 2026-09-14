"""Ginger APP: расписание по умолчанию — таблица

Решение Ивана 14.09: плотная таблица «золото по ценности» — основной вид расписания.
Все текущие пользователи — тестовые, поэтому переводим и их; карточки остаются в профиле.

Revision ID: e6a4b9c3d7f5
Revises: d5f3a8b2c6e4
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e6a4b9c3d7f5"
down_revision: str | None = "d5f3a8b2c6e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "schedule_view", server_default=sa.text("'table'"))
    op.execute("UPDATE users SET schedule_view = 'table' WHERE schedule_view = 'cards'")


def downgrade() -> None:
    op.alter_column("users", "schedule_view", server_default=sa.text("'cards'"))
