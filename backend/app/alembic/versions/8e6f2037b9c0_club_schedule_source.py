"""Ginger APP: автозагрузка сетки клуба по ссылке на опубликованный лист

Ответ Ивана 11.31: лист Private.G забираем сами раз в день. Та же схема подходит NUTS —
опубликованная ссылка на лист постоянная.

Revision ID: 8e6f2037b9c0
Revises: 7d5e1f26a8b9
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8e6f2037b9c0"
down_revision: str | None = "7d5e1f26a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SOURCES = {
    "ginger": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7-OC6PxF1wSXigQM9SMGZDgafNeY4uZzV2DUob"
        "c8789xWwg5s-NDhLJXuXPIiKxIUrF8Q5vu3knQS/pub?gid=683108560&single=true&output=csv"
    ),
    "private-g": (
        "https://docs.google.com/spreadsheets/d/1YTeS47T9eISDV5CxgSNGGLxyUtEBNViTs4iC06u3qRE"
        "/export?format=csv"
    ),
}


def upgrade() -> None:
    op.add_column("clubs", sa.Column("schedule_source_url", sa.Text(), nullable=True))
    op.add_column(
        "clubs", sa.Column("schedule_fetched_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("clubs", sa.Column("schedule_fetch_error", sa.Text(), nullable=True))
    clubs = sa.table(
        "clubs", sa.column("slug", sa.String), sa.column("schedule_source_url", sa.Text)
    )
    for slug, url in SOURCES.items():
        op.execute(clubs.update().where(clubs.c.slug == slug).values(schedule_source_url=url))


def downgrade() -> None:
    op.drop_column("clubs", "schedule_fetch_error")
    op.drop_column("clubs", "schedule_fetched_at")
    op.drop_column("clubs", "schedule_source_url")
