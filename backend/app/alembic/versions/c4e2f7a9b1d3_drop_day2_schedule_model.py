"""Ginger APP: удаление модели расписания Day2

Серии, события, флайты, площадки, страны, закладки, журнал изменений и импорт афиш
достались от форка Day2 (живые фестивали). У Ginger APP свои клубы, сетки и турниры —
план сборки: «модель Day2 удаляется целиком, когда наша заработает». Данных Day2 на
боевом сервере нет: демо-расписание и dev-пользователи в production не сеются.

Попутно: организаторы Day2 (RPT, EAPT, APC, RPF, BPT), логотипы и привязка парсеров
у союзов, поля пользователя «базовая валюта», «часовой пояс», «интервалы напоминаний».

Откат не предусмотрен: вернуть Day2 — это откатить код, а не схему.

Revision ID: c4e2f7a9b1d3
Revises: b19c536ae2f3
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "c4e2f7a9b1d3"
down_revision: str | None = "b19c536ae2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DAY2_NOTIFICATION_TYPES = (
    "schedule_published",
    "time_changed",
    "event_cancelled",
    "guarantee_changed",
    "series_starting",
    "series_cancelled",
)

_DAY2_TABLES = (
    "bookmarks",
    "change_log",
    "import_jobs",
    "slug_redirects",
    "blind_levels",
    "flights",
    "events",
    "series",
    "venues",
    "countries",
    "parser_profiles",
)

# game_type не трогаем: его использует модель турниров Ginger.
_DAY2_ENUMS = (
    "series_status",
    "event_status",
    "entry_type",
    "bookmark_target",
    "change_type",
    "import_status",
    "import_kind",
    "parse_path",
)


def upgrade() -> None:
    types = ", ".join(f"'{value}'" for value in _DAY2_NOTIFICATION_TYPES)
    op.execute(
        "DELETE FROM notification_queue "
        f"WHERE bookmark_id IS NOT NULL OR change_log_id IS NOT NULL OR type::text IN ({types})"
    )
    for index in (
        "uq_notification_queue_reminder_bookmark_scheduled_at",
        "ix_notification_queue_bookmark_id",
        "ix_notification_queue_change_log_id",
        "uq_notification_queue_change_log_user_type",
    ):
        op.execute(f"DROP INDEX IF EXISTS {index}")
    op.execute("ALTER TABLE notification_queue DROP COLUMN IF EXISTS bookmark_id")
    op.execute("ALTER TABLE notification_queue DROP COLUMN IF EXISTS change_log_id")

    for column in ("schedule_parser_id", "structure_parser_id", "logo_data", "logo_content_type"):
        op.execute(f"ALTER TABLE organizers DROP COLUMN IF EXISTS {column}")

    for column in ("base_currency", "timezone", "default_reminder_offsets"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {column}")

    for table in _DAY2_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    for enum in _DAY2_ENUMS:
        op.execute(f"DROP TYPE IF EXISTS {enum}")

    # Организаторы Day2 — после таблицы серий: серии ссылались на них внешним ключом.
    op.execute(
        "DELETE FROM organizers WHERE slug IN ('rpt', 'eapt', 'apc', 'rpf', 'bpt') "
        "AND NOT EXISTS (SELECT 1 FROM clubs WHERE clubs.organizer_id = organizers.id)"
    )
    # Значения Day2 в notification_type остаются: Postgres не удаляет значения enum.


def downgrade() -> None:
    raise NotImplementedError("Удаление модели Day2 необратимо: откатывайте код, а не схему")
