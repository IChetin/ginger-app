"""Ginger APP: удаление реплеера, трекера и live-сессий из базы Day2

Ginger APP построен на форке Day2. Реплеер раздач, трекер результатов и live-сессии
в нём не нужны — код удалён, здесь удаляются их таблицы, колонки пользователя и типы.

Revision ID: 1ede63461589
Revises: d3a4b5c6e7f8
Create Date: 2026-09-10
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "1ede63461589"
down_revision: str | None = "d3a4b5c6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Порядок важен: сначала зависимые таблицы, потом те, на которые они ссылаются.
# CASCADE — страховка от внешних ключей, которые могли появиться в промежуточных миграциях.
_TABLES = (
    "live_events",
    "live_sessions",
    "result_events",
    "results",
    "hands",
)

_USER_COLUMNS = (
    "results_visibility",
    "stack_display",
    "hide_holes_until_showdown",
    "hand_input_mode",
    "card_deck",
)

_ENUM_TYPES = (
    "live_event_type",
    "live_session_status",
    "hand_status",
    "results_visibility",
    "stack_display",
    "hand_input_mode",
    "card_deck",
)


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    for column in _USER_COLUMNS:
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {column}")
    # Типы удаляются после колонок и таблиц, которые их использовали.
    for enum_type in _ENUM_TYPES:
        op.execute(f"DROP TYPE IF EXISTS {enum_type}")


def downgrade() -> None:
    # Таблицы удаляются вместе с данными — вернуть их нечем. Если нужен откат,
    # восстанавливайте базу из бэкапа, сделанного до этой миграции.
    raise NotImplementedError(
        "Удаление реплеера, трекера и live-сессий необратимо: данные удалены вместе с таблицами."
    )
