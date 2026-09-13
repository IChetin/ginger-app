"""Ginger APP: убран пароль турнира — у турниров клубов паролей не бывает

Решение Ивана 2026-09-13 (вопрос 11.6).

Revision ID: 6c4d0e15f7a8
Revises: 5b3c9d04e6f7
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6c4d0e15f7a8"
down_revision: str | None = "5b3c9d04e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("tournament_templates", "tournaments"):
        op.drop_column(table, "password")


def downgrade() -> None:
    for table in ("tournaments", "tournament_templates"):
        op.add_column(table, sa.Column("password", sa.String(64)))
