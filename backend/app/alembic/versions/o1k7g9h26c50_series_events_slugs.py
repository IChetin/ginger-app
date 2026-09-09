"""series.slug, events.slug, slug_redirects

Revision ID: o1k7g9h26c50
Revises: n0j6f8g15b49
Create Date: 2026-07-30
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa
from alembic import op

revision: str = "o1k7g9h26c50"
down_revision: str | None = "n0j6f8g15b49"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CYRILLIC = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "e",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "h",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "sch",
        "ъ": "",
        "ы": "y",
        "ь": "",
        "э": "e",
        "ю": "yu",
        "я": "ya",
    }
)

_MAX_LEN = 80


def _slugify(value: str, *, fallback: str) -> str:
    text = unicodedata.normalize("NFKC", value).strip().lower().translate(_CYRILLIC)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return (text or fallback)[:_MAX_LEN].strip("-") or fallback


def _unique(base: str, taken: set[str]) -> str:
    candidate = base[:_MAX_LEN].strip("-") or "item"
    if candidate not in taken:
        taken.add(candidate)
        return candidate
    n = 2
    while True:
        suffix = f"-{n}"
        trimmed = base[: max(1, _MAX_LEN - len(suffix))].rstrip("-")
        candidate = f"{trimmed}{suffix}"
        if candidate not in taken:
            taken.add(candidate)
            return candidate
        n += 1


def upgrade() -> None:
    op.add_column("series", sa.Column("slug", sa.String(length=120), nullable=True))
    op.add_column("events", sa.Column("slug", sa.String(length=120), nullable=True))

    conn = op.get_bind()

    series_rows = conn.execute(
        sa.text(
            """
            SELECT s.id, s.starts_on, o.slug AS organizer_slug, v.city
            FROM series s
            JOIN organizers o ON o.id = s.organizer_id
            JOIN venues v ON v.id = s.venue_id
            ORDER BY s.starts_on, s.id
            """
        )
    ).fetchall()
    used_series: set[str] = set()
    for row in series_rows:
        starts_on = row.starts_on
        if isinstance(starts_on, date):
            period = f"{starts_on.year}-{starts_on.month:02d}"
        else:
            period = str(starts_on)[:7]
        base = _slugify(
            f"{row.organizer_slug}-{row.city}-{period}",
            fallback=f"series-{str(row.id)[:8]}",
        )
        slug = _unique(base, used_series)
        conn.execute(
            sa.text("UPDATE series SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row.id},
        )

    event_rows = conn.execute(
        sa.text(
            """
            SELECT id, series_id, number, name
            FROM events
            ORDER BY series_id, number NULLS LAST, id
            """
        )
    ).fetchall()
    taken_by_series: dict[object, set[str]] = {}
    for row in event_rows:
        taken = taken_by_series.setdefault(row.series_id, set())
        name_part = _slugify(str(row.name), fallback=f"event-{str(row.id)[:8]}")
        if row.number is not None:
            base = _slugify(f"{row.number}-{name_part}", fallback=name_part)
        else:
            base = name_part
        slug = _unique(base, taken)
        conn.execute(
            sa.text("UPDATE events SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row.id},
        )

    op.alter_column("series", "slug", nullable=False)
    op.alter_column("events", "slug", nullable=False)
    op.create_index("uq_series_slug", "series", ["slug"], unique=True)
    op.create_index(
        "uq_events_series_id_slug",
        "events",
        ["series_id", "slug"],
        unique=True,
    )

    op.create_table(
        "slug_redirects",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("old_slug", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "entity_type IN ('series', 'event')",
            name="ck_slug_redirects_slug_redirect_entity_type_values",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_slug_redirects"),
        sa.UniqueConstraint(
            "entity_type",
            "old_slug",
            name="uq_slug_redirects_entity_type_old_slug",
        ),
    )
    op.create_index(
        "ix_slug_redirects_entity_type_entity_id",
        "slug_redirects",
        ["entity_type", "entity_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_slug_redirects_entity_type_entity_id", table_name="slug_redirects")
    op.drop_table("slug_redirects")
    op.drop_index("uq_events_series_id_slug", table_name="events")
    op.drop_index("uq_series_slug", table_name="series")
    op.drop_column("events", "slug")
    op.drop_column("series", "slug")
