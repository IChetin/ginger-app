"""Ginger APP: аккаунты в клубах без проверки менеджером

Решение Ивана 24.09: привязанный аккаунт сразу в работе. Всё, что ждало проверки,
подтверждается разом, чтобы игроки не застряли со старыми заявками.

Revision ID: n5f3d8h2c6e4
Revises: m4e2c7g1b5d3
Create Date: 2026-09-24
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "n5f3d8h2c6e4"
# После самостоятельной регистрации (m4e2c7g1b5d3).
down_revision: str | None = "m4e2c7g1b5d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE player_accounts SET status = 'confirmed', reviewed_at = now() "
        "WHERE status = 'pending'"
    )


def downgrade() -> None:
    # Какие аккаунты ждали проверки, не запоминали — откатывать нечего.
    pass
