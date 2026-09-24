"""Ginger APP: игрок отменяет заявку на фишки сам

Решение Ивана 24.09: ошибся клубом или суммой — отменяет (или правит: отмена плюс новая
заявка) в любой момент, пока не отправил оплату. Менеджерам — отдельное уведомление.

Revision ID: o6g4e9i3d7f5
Revises: n5f3d8h2c6e4
Create Date: 2026-09-24
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "o6g4e9i3d7f5"
# После аккаунтов без проверки (n5f3d8h2c6e4).
down_revision: str | None = "n5f3d8h2c6e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE chip_request_status ADD VALUE IF NOT EXISTS 'cancelled'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'chip_request_cancelled'")


def downgrade() -> None:
    # Значения enum в Postgres поштучно не удаляются — тип остаётся расширенным.
    pass
