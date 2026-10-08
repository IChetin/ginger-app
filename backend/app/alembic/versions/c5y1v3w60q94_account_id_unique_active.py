"""player_accounts: ID в клубе уникален только среди неотклонённых привязок

Иван, 08.10: игровой ID один на всю базу. Чужую привязку менеджер отклоняет, и
настоящий владелец должен суметь привязать свой ID в том же клубе — поэтому
отклонённые строки уникальность больше не держат. Проверка «один ID — один игрок
в приложении» живёт в сервисе: в БД её одним индексом не выразить (у игрока одна
и та же пара «приложение + ID» во всех клубах приложения).

Revision ID: c5y1v3w60q94
Revises: b4x0u2v59p83
Create Date: 2026-10-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c5y1v3w60q94"
down_revision: str | None = "b4x0u2v59p83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_player_accounts_club_id_app_account_id", "player_accounts", type_="unique"
    )
    op.create_index(
        "uq_player_accounts_club_id_app_account_id",
        "player_accounts",
        ["club_id", "app_account_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'rejected'"),
    )


def downgrade() -> None:
    op.drop_index("uq_player_accounts_club_id_app_account_id", table_name="player_accounts")
    op.create_unique_constraint(
        "uq_player_accounts_club_id_app_account_id",
        "player_accounts",
        ["club_id", "app_account_id"],
    )
