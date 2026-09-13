"""parser_profiles + organizers parser bindings

Revision ID: q3m9i1j48e72
Revises: p2l8h0i37d61
Create Date: 2026-07-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "q3m9i1j48e72"
down_revision: str | None = "p2l8h0i37d61"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Default titles for built-in parsers (migration seed).
_BUILTIN: list[tuple[str, str, str]] = [
    ("apc_xlsx_v1", "APC · Excel (Анонс)", "schedule"),
    ("rpf_pdf_v1", "RPF · PDF", "schedule"),
    ("bpt_pdf_v1", "BPT · PDF / OCR", "schedule"),
    ("rpt_structure_pdf_v1", "RPT · структуры PDF", "structures"),
]

# slug → parser code for schedule / structure bindings.
_SCHEDULE_BINDINGS: dict[str, str] = {
    "apc": "apc_xlsx_v1",
    "rpf": "rpf_pdf_v1",
    "bpt": "bpt_pdf_v1",
}
_STRUCTURE_BINDINGS: dict[str, str] = {
    "rpt": "rpt_structure_pdf_v1",
}


def upgrade() -> None:
    op.create_table(
        "parser_profiles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "is_available",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('schedule', 'structures')",
            name="ck_parser_profiles_kind_values",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_parser_profiles")),
        sa.UniqueConstraint("code", name=op.f("uq_parser_profiles_code")),
    )

    profiles = sa.table(
        "parser_profiles",
        sa.column("code", sa.String),
        sa.column("title", sa.String),
        sa.column("kind", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("is_available", sa.Boolean),
    )
    op.bulk_insert(
        profiles,
        [
            {
                "code": code,
                "title": title,
                "kind": kind,
                "is_active": True,
                "is_available": True,
            }
            for code, title, kind in _BUILTIN
        ],
    )

    op.add_column(
        "organizers",
        sa.Column("schedule_parser_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "organizers",
        sa.Column("structure_parser_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_organizers_schedule_parser_id_parser_profiles"),
        "organizers",
        "parser_profiles",
        ["schedule_parser_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_organizers_structure_parser_id_parser_profiles"),
        "organizers",
        "parser_profiles",
        ["structure_parser_id"],
        ["id"],
        ondelete="SET NULL",
    )

    conn = op.get_bind()
    for slug, code in _SCHEDULE_BINDINGS.items():
        conn.execute(
            sa.text(
                """
                UPDATE organizers
                SET schedule_parser_id = (
                    SELECT id FROM parser_profiles WHERE code = :code
                )
                WHERE slug = :slug AND schedule_parser_id IS NULL
                """
            ),
            {"code": code, "slug": slug},
        )
    for slug, code in _STRUCTURE_BINDINGS.items():
        conn.execute(
            sa.text(
                """
                UPDATE organizers
                SET structure_parser_id = (
                    SELECT id FROM parser_profiles WHERE code = :code
                )
                WHERE slug = :slug AND structure_parser_id IS NULL
                """
            ),
            {"code": code, "slug": slug},
        )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_organizers_structure_parser_id_parser_profiles"),
        "organizers",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_organizers_schedule_parser_id_parser_profiles"),
        "organizers",
        type_="foreignkey",
    )
    op.drop_column("organizers", "structure_parser_id")
    op.drop_column("organizers", "schedule_parser_id")
    op.drop_table("parser_profiles")
