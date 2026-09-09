import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ImportKind, ImportStatus, ParsePath, pg_enum

if TYPE_CHECKING:
    from app.models.auth import User
    from app.models.references import Organizer
    from app.models.schedule import Series


class ParserProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Admin-facing profile for a code parser registered in the in-memory registry.

    Rows are upserted by sync; editors may change title / is_active / notes only.
    """

    __tablename__ = "parser_profiles"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('schedule', 'structures')",
            name="kind_values",
        ),
    )

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )
    notes: Mapped[str | None] = mapped_column(Text)

    organizers_schedule: Mapped[list["Organizer"]] = relationship(
        back_populates="schedule_parser",
        foreign_keys="Organizer.schedule_parser_id",
    )
    organizers_structure: Mapped[list["Organizer"]] = relationship(
        back_populates="structure_parser",
        foreign_keys="Organizer.structure_parser_id",
    )


class ImportJob(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "import_jobs"
    __table_args__ = (
        CheckConstraint(
            "detected_type IN ('xlsx', 'csv', 'pdf', 'image')",
            name="detected_type_values",
        ),
        Index("ix_import_jobs_status_created_at", "status", "created_at"),
    )

    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    detected_type: Mapped[str] = mapped_column(String(8), nullable=False)
    import_kind: Mapped[ImportKind] = mapped_column(
        pg_enum(ImportKind, "import_kind"),
        nullable=False,
        server_default=text("'schedule'"),
    )
    organizer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizers.id"))
    series_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("series.id"))
    file_timezone: Mapped[str | None] = mapped_column(String(64))
    parser_requested: Mapped[str | None] = mapped_column(String(64))
    parser_used: Mapped[str | None] = mapped_column(String(64))
    parse_path: Mapped[ParsePath | None] = mapped_column(pg_enum(ParsePath, "parse_path"))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    tokens_input: Mapped[int | None] = mapped_column(Integer)
    tokens_output: Mapped[int | None] = mapped_column(Integer)
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    fields_total: Mapped[int | None] = mapped_column(Integer)
    fields_corrected: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[ImportStatus] = mapped_column(
        pg_enum(ImportStatus, "import_status"),
        nullable=False,
        server_default=text("'uploaded'"),
    )
    initial_draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    uploader: Mapped["User"] = relationship(back_populates="import_jobs")
    organizer: Mapped["Organizer | None"] = relationship(back_populates="import_jobs")
    series: Mapped["Series | None"] = relationship(back_populates="import_jobs")
