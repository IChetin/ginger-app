"""venues.slug unique

Revision ID: h4d0f2a59b83
Revises: g3c9e1f48a72
Create Date: 2026-07-26
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "h4d0f2a59b83"
down_revision: str | None = "g3c9e1f48a72"
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


def _slugify(value: str, *, fallback: str) -> str:
    text = unicodedata.normalize("NFKC", value).strip().lower().translate(_CYRILLIC)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return (text or fallback)[:64].strip("-") or fallback


def upgrade() -> None:
    op.add_column("venues", sa.Column("slug", sa.String(length=64), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, name FROM venues")).fetchall()
    used: set[str] = set()
    for row in rows:
        base = _slugify(str(row.name), fallback=f"venue-{str(row.id)[:8]}")
        slug = base
        n = 2
        while slug in used:
            suffix = f"-{n}"
            slug = f"{base[: 64 - len(suffix)]}{suffix}"
            n += 1
        used.add(slug)
        conn.execute(
            sa.text("UPDATE venues SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row.id},
        )
    op.alter_column("venues", "slug", nullable=False)
    op.create_index("ix_venues_slug", "venues", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_venues_slug", table_name="venues")
    op.drop_column("venues", "slug")
