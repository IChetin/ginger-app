"""hands.slug required for drafts; generate at create, keep on publish

Revision ID: z2v8s0t37n61
Revises: y1u7r9s26m50
Create Date: 2026-08-22
"""

from __future__ import annotations

import secrets
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "z2v8s0t37n61"
down_revision: str | None = "y1u7r9s26m50"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_SLUG_LEN = 10


def _new_slug(taken: set[str]) -> str:
    while True:
        slug = "".join(secrets.choice(_ALPHABET) for _ in range(_SLUG_LEN))
        if slug not in taken:
            taken.add(slug)
            return slug


def upgrade() -> None:
    op.drop_constraint("ck_hands_hand_status_shape", "hands", type_="check")
    conn = op.get_bind()
    taken = {
        row[0]
        for row in conn.execute(sa.text("SELECT slug FROM hands WHERE slug IS NOT NULL")).fetchall()
        if row[0]
    }
    missing = conn.execute(sa.text("SELECT id FROM hands WHERE slug IS NULL")).fetchall()
    for (hand_id,) in missing:
        conn.execute(
            sa.text("UPDATE hands SET slug = :slug WHERE id = :id"),
            {"slug": _new_slug(taken), "id": hand_id},
        )
    op.drop_index("uq_hands_slug", table_name="hands")
    op.alter_column("hands", "slug", existing_type=sa.String(length=12), nullable=False)
    op.create_index("uq_hands_slug", "hands", ["slug"], unique=True)
    op.create_check_constraint(
        "ck_hands_hand_status_shape",
        "hands",
        "(status = 'published' AND slug IS NOT NULL AND current_step IS NULL) "
        "OR (status = 'draft' AND slug IS NOT NULL AND is_public = false "
        "AND current_step BETWEEN 1 AND 4)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_hands_hand_status_shape", "hands", type_="check")
    op.drop_index("uq_hands_slug", table_name="hands")
    op.alter_column("hands", "slug", existing_type=sa.String(length=12), nullable=True)
    op.execute(sa.text("UPDATE hands SET slug = NULL WHERE status = 'draft'"))
    op.create_index(
        "uq_hands_slug",
        "hands",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("slug IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_hands_hand_status_shape",
        "hands",
        "(status = 'published' AND slug IS NOT NULL AND current_step IS NULL) "
        "OR (status = 'draft' AND slug IS NULL AND is_public = false "
        "AND current_step BETWEEN 1 AND 4)",
    )
