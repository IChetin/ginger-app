"""Ginger APP: игроки, инвайты, аккаунты в клубах, заявки на фишки

Этап 5 плана сборки — ядро продукта.

Revision ID: 7d5e1f26a8b9
Revises: 6c4d0e15f7a8
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "7d5e1f26a8b9"
down_revision: str | None = "6c4d0e15f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

player_kind = postgresql.ENUM("credit", "deposit", name="player_kind", create_type=False)
player_status = postgresql.ENUM(
    "active", "blocked", "archived", name="player_status", create_type=False
)
player_account_status = postgresql.ENUM(
    "pending", "confirmed", "rejected", name="player_account_status", create_type=False
)
chip_request_kind = postgresql.ENUM(
    "topup", "withdrawal", name="chip_request_kind", create_type=False
)
chip_request_status = postgresql.ENUM(
    "sent",
    "accepted",
    "awaiting_payment",
    "paid",
    "completed",
    "rejected",
    "expired",
    name="chip_request_status",
    create_type=False,
)
_ENUMS = (player_kind, player_status, player_account_status, chip_request_kind, chip_request_status)

_NEW_NOTIFICATION_TYPES = (
    "chips_issued",
    "requisites_ready",
    "request_rejected",
    "withdrawal_sent",
    "new_chip_request",
)


def _id() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _updated_at() -> sa.Column:
    return sa.Column(
        "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _fk(column: str, target: str, ondelete: str, *, nullable: bool = True) -> sa.Column:
    return sa.Column(
        column,
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey(target, ondelete=ondelete),
        nullable=nullable,
    )


def upgrade() -> None:
    bind = op.get_bind()
    for enum in _ENUMS:
        enum.create(bind, checkfirst=True)
    for value in _NEW_NOTIFICATION_TYPES:
        op.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{value}'")

    op.create_table(
        "players",
        _id(),
        _created_at(),
        _updated_at(),
        _fk("user_id", "users.id", "CASCADE", nullable=False),
        sa.Column("kind", player_kind, nullable=False, server_default="credit"),
        sa.Column("status", player_status, nullable=False, server_default="active"),
        sa.Column("offline_access", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("results_consent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("birthday", sa.Date()),
        _fk("referrer_player_id", "players.id", "SET NULL"),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("uq_players_user_id", "players", ["user_id"], unique=True)
    op.create_index("ix_players_status", "players", ["status"])

    op.create_table(
        "invites",
        _id(),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("player_kind", player_kind, nullable=False, server_default="credit"),
        sa.Column("note", sa.String(200)),
        _fk("created_by_user_id", "users.id", "SET NULL"),
        _fk("referrer_player_id", "players.id", "SET NULL"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        _fk("used_by_user_id", "users.id", "SET NULL"),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        _created_at(),
    )
    op.create_index("uq_invites_token_hash", "invites", ["token_hash"], unique=True)

    op.create_table(
        "player_accounts",
        _id(),
        _created_at(),
        _updated_at(),
        _fk("player_id", "players.id", "CASCADE", nullable=False),
        _fk("club_id", "clubs.id", "CASCADE", nullable=False),
        sa.Column("nickname", sa.String(64), nullable=False),
        sa.Column("app_account_id", sa.String(32), nullable=False),
        sa.Column("status", player_account_status, nullable=False, server_default="pending"),
        _fk("reviewed_by_user_id", "users.id", "SET NULL"),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "club_id", "app_account_id", name="uq_player_accounts_club_id_app_account_id"
        ),
    )
    op.create_index("ix_player_accounts_player_id", "player_accounts", ["player_id"])
    op.create_index("ix_player_accounts_status", "player_accounts", ["status"])

    op.create_table(
        "attachments",
        _id(),
        _fk("owner_user_id", "users.id", "CASCADE", nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(200), nullable=False),
        sa.Column("delete_after", sa.DateTime(timezone=True)),
        _created_at(),
    )
    op.create_index("uq_attachments_storage_key", "attachments", ["storage_key"], unique=True)

    op.create_table(
        "requisite_templates",
        _id(),
        _created_at(),
        _updated_at(),
        sa.Column("title", sa.String(64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.create_table(
        "chip_requests",
        _id(),
        _created_at(),
        _updated_at(),
        _fk("player_id", "players.id", "CASCADE", nullable=False),
        sa.Column("kind", chip_request_kind, nullable=False),
        sa.Column("status", chip_request_status, nullable=False, server_default="sent"),
        _fk("handled_by_user_id", "users.id", "SET NULL"),
        sa.Column("payment_requisites", sa.Text()),
        sa.Column("payment_deadline_at", sa.DateTime(timezone=True)),
        _fk("screenshot_id", "attachments.id", "SET NULL"),
        sa.Column("withdrawal_requisites", sa.Text()),
        sa.Column("reject_comment", sa.Text()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_chip_requests_status_created_at", "chip_requests", ["status", "created_at"])
    op.create_index(
        "ix_chip_requests_player_id_created_at", "chip_requests", ["player_id", "created_at"]
    )

    op.create_table(
        "chip_request_items",
        _id(),
        _fk("request_id", "chip_requests.id", "CASCADE", nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        _fk("player_account_id", "player_accounts.id", "RESTRICT", nullable=False),
        _fk("club_id", "clubs.id", "RESTRICT", nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("chip_value", sa.Numeric(12, 4)),
        sa.Column("chip_currency_code", sa.String(8), sa.ForeignKey("currencies.code")),
        sa.CheckConstraint("amount > 0", name="amount_positive"),
    )
    op.create_index("ix_chip_request_items_request_id", "chip_request_items", ["request_id"])

    op.create_table(
        "chip_request_events",
        _id(),
        _fk("request_id", "chip_requests.id", "CASCADE", nullable=False),
        _fk("actor_user_id", "users.id", "SET NULL"),
        sa.Column("from_status", chip_request_status),
        sa.Column("to_status", chip_request_status, nullable=False),
        sa.Column("comment", sa.Text()),
        _created_at(),
    )
    op.create_index("ix_chip_request_events_request_id", "chip_request_events", ["request_id"])


def downgrade() -> None:
    for table in (
        "chip_request_events",
        "chip_request_items",
        "chip_requests",
        "requisite_templates",
        "attachments",
        "player_accounts",
        "invites",
        "players",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    for enum in reversed(_ENUMS):
        enum.drop(bind, checkfirst=True)
    # Значения notification_type не удаляются: PostgreSQL не умеет убирать значения из enum.
