"""Ginger APP: клубы, шаблоны сеток и турниры

Своя доменная модель расписания рядом со старой моделью Day2 (series/events/flights).
Старая удаляется отдельной миграцией, когда эта заработает. Заодно код валюты расширен
до VARCHAR(8) — курс фишки в долларовых клубах задаётся в USDT.

Revision ID: 2a7c9e41b3d0
Revises: 1ede63461589
Create Date: 2026-09-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "2a7c9e41b3d0"
down_revision: str | None = "1ede63461589"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

poker_app = postgresql.ENUM(
    "pppoker", "xpoker", "poker21", "other", name="poker_app", create_type=False
)
club_block = postgresql.ENUM("online", "offline", name="club_block", create_type=False)
bounty_kind = postgresql.ENUM("none", "ko", "pko", "mystery", name="bounty_kind", create_type=False)
tournament_status = postgresql.ENUM(
    "scheduled", "cancelled", name="tournament_status", create_type=False
)
# Тип уже есть — его создала модель расписания Day2, и он переживёт её удаление.
game_type = postgresql.ENUM(name="game_type", create_type=False)

_NEW_ENUMS = (poker_app, club_block, bounty_kind, tournament_status)


def _tournament_columns() -> list[sa.Column]:
    """Поля, общие для шаблона и турнира (TournamentFieldsMixin)."""
    return [
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("game_type", game_type, nullable=False, server_default="nlh"),
        sa.Column("bounty_kind", bounty_kind, nullable=False, server_default="none"),
        sa.Column("buyin", sa.Numeric(12, 2), nullable=False),
        sa.Column("guarantee", sa.Numeric(14, 2)),
        sa.Column("rebuy_cost", sa.Numeric(12, 2)),
        sa.Column("rebuy_terms", sa.String(32)),
        sa.Column("addon_cost", sa.Numeric(12, 2)),
        sa.Column("addon_terms", sa.String(32)),
        sa.Column("start_stack", sa.Integer()),
        sa.Column("table_size", sa.SmallInteger()),
        sa.Column("late_reg_levels", sa.SmallInteger()),
        sa.Column("level_minutes", sa.String(16)),
        sa.Column("structure", sa.String(32)),
        sa.Column("ticket_value", sa.Numeric(12, 2)),
        sa.Column("password", sa.String(64)),
        sa.Column("is_promoted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text()),
    ]


def _base_columns() -> list[sa.Column]:
    return [
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def _widen_currency_codes(width: int) -> None:
    """Код валюты CHAR(3) → VARCHAR(width): нужен USDT, которого нет в ISO 4217.

    Внешние ключи на currencies.code находятся по каталогу, снимаются на время смены типа
    и возвращаются с прежними определениями — список ссылающихся таблиц не зашит в миграцию.
    """
    bind = op.get_bind()
    fks = bind.execute(
        sa.text(
            """
            SELECT c.conrelid::regclass::text AS table_name,
                   c.conname,
                   a.attname AS column_name,
                   pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
            WHERE c.contype = 'f' AND c.confrelid = 'currencies'::regclass
            """
        )
    ).all()
    for fk in fks:
        op.execute(f'ALTER TABLE {fk.table_name} DROP CONSTRAINT "{fk.conname}"')
    op.execute(f"ALTER TABLE currencies ALTER COLUMN code TYPE varchar({width})")
    for fk in fks:
        op.execute(
            f"ALTER TABLE {fk.table_name} ALTER COLUMN {fk.column_name} TYPE varchar({width})"
        )
        op.execute(f'ALTER TABLE {fk.table_name} ADD CONSTRAINT "{fk.conname}" {fk.definition}')


def upgrade() -> None:
    _widen_currency_codes(8)

    bind = op.get_bind()
    for enum in _NEW_ENUMS:
        enum.create(bind, checkfirst=True)

    op.create_table(
        "clubs",
        *_base_columns(),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("app", poker_app, nullable=False),
        sa.Column("app_club_id", sa.String(32)),
        sa.Column(
            "organizer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizers.id", ondelete="SET NULL"),
        ),
        sa.Column("block", club_block, nullable=False, server_default="online"),
        sa.Column("chip_value", sa.Numeric(12, 4)),
        sa.Column("chip_currency_code", sa.String(8), sa.ForeignKey("currencies.code")),
        sa.Column("games", sa.String(64)),
        sa.Column("limits", sa.String(64)),
        sa.Column("peak_hours", sa.String(32)),
        sa.Column("active_players", sa.String(32)),
        sa.Column("download_url", sa.Text()),
        sa.Column("join_steps", sa.Text()),
        sa.Column("rakeback_note", sa.Text()),
        sa.Column("manager_note", sa.String(128)),
        sa.Column("notes", sa.Text()),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_promoted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("chip_value IS NULL OR chip_value > 0", name="chip_value_positive"),
        sa.CheckConstraint(
            "(chip_value IS NULL) = (chip_currency_code IS NULL)", name="chip_rate_complete"
        ),
    )
    op.create_index("uq_clubs_slug", "clubs", ["slug"], unique=True)
    op.create_index("ix_clubs_organizer_id", "clubs", ["organizer_id"])

    op.create_table(
        "tournament_templates",
        *_base_columns(),
        *_tournament_columns(),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("weekdays", postgresql.ARRAY(sa.SmallInteger()), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("late_reg_close_offset_min", sa.Integer()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_until", sa.Date()),
        sa.Column("source", sa.String(32)),
        sa.CheckConstraint(
            "cardinality(weekdays) > 0 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]",
            name="weekdays_iso",
        ),
        sa.CheckConstraint("buyin >= 0", name="buyin_non_negative"),
        sa.CheckConstraint(
            "valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from",
            name="validity_range",
        ),
    )
    op.create_index("ix_tournament_templates_club_id", "tournament_templates", ["club_id"])

    op.create_table(
        "tournaments",
        *_base_columns(),
        *_tournament_columns(),
        sa.Column(
            "club_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tournament_templates.id", ondelete="SET NULL"),
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("late_reg_closes_at", sa.DateTime(timezone=True)),
        sa.Column("status", tournament_status, nullable=False, server_default="scheduled"),
        sa.Column("is_detached", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint(
            "club_id", "starts_at", "name", name="uq_tournaments_club_starts_at_name"
        ),
        sa.CheckConstraint("buyin >= 0", name="buyin_non_negative"),
        sa.CheckConstraint(
            "late_reg_closes_at IS NULL OR late_reg_closes_at >= starts_at",
            name="late_reg_after_start",
        ),
    )
    op.create_index("ix_tournaments_starts_at", "tournaments", ["starts_at"])
    op.create_index("ix_tournaments_club_id_starts_at", "tournaments", ["club_id", "starts_at"])


def downgrade() -> None:
    op.drop_table("tournaments")
    op.drop_table("tournament_templates")
    op.drop_table("clubs")
    bind = op.get_bind()
    for enum in reversed(_NEW_ENUMS):
        enum.drop(bind, checkfirst=True)
    # Код валюты обратно в CHAR(3) не сужаем: VARCHAR(8) совместим со старым кодом,
    # а сужение упадёт на USDT.
