from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.enums import GameType, ImportKind, ImportStatus, ParsePath
from app.schemas.notifications import FieldDiff, NotificationImpactItem


class DraftCellIssue(BaseModel):
    field: str
    severity: Literal["error", "warning"]
    message: str
    code: str | None = None


class DraftFlight(BaseModel):
    label: str | None = Field(default=None, max_length=16)
    play_date: date
    play_time: time
    confidence: Decimal | None = Field(default=None, ge=0, le=1)
    source_row: int | None = None
    source_sheet: str | None = None
    source_page: int | None = None
    source_cell: str | None = None
    source_fragment: str | None = Field(default=None, max_length=2000)


class DraftEvent(BaseModel):
    number: int | None = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=160)
    buyin: Decimal = Field(ge=0)
    buyin_bounty: Decimal | None = Field(default=None, ge=0)
    currency_code: str = Field(min_length=3, max_length=3)
    guarantee: Decimal | None = Field(default=None, ge=0)
    game_type: GameType = GameType.NLH
    tags: list[str] = Field(default_factory=list)
    start_stack: int | None = Field(default=None, ge=0)
    reentry_count: int | None = Field(default=None, ge=0)
    reentry_unlimited: bool = False
    late_reg_level: int | None = Field(default=None, ge=1)
    day_end_note: str | None = Field(default=None, max_length=40)
    notes: str | None = None
    flights: list[DraftFlight] = Field(min_length=1)
    field_confidence: dict[str, Decimal] = Field(default_factory=dict)
    issues: list[DraftCellIssue] = Field(default_factory=list)
    parse_path: ParsePath | None = None
    source_row: int | None = None
    source_sheet: str | None = None
    source_page: int | None = None
    source_cell: str | None = None
    source_fragment: str | None = Field(default=None, max_length=2000)

    @field_validator("currency_code")
    @classmethod
    def _currency(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def _reentry(self) -> DraftEvent:
        if self.reentry_unlimited and self.reentry_count is not None:
            raise ValueError("reentry_count must be empty when reentry_unlimited is true")
        if (
            self.buyin_bounty is not None
            and self.buyin_bounty > 0
            and self.buyin_bounty >= self.buyin
        ):
            raise ValueError("buyin_bounty must be less than buyin (buyin is total)")
        return self

    @field_serializer("buyin", "buyin_bounty", "guarantee")
    def serialize_money(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class DraftBlindLevel(BaseModel):
    level_no: int = Field(ge=1)
    sb: int | None = Field(default=None, ge=0)
    bb: int | None = Field(default=None, ge=0)
    ante: int | None = Field(default=None, ge=0)
    minutes: int = Field(gt=0)
    is_break: bool = False
    is_late_reg_end: bool = False


class DraftStructureSet(BaseModel):
    label: str = Field(default="default", max_length=16)
    levels: list[DraftBlindLevel] = Field(min_length=1)


class DraftStructure(BaseModel):
    source_title: str = Field(min_length=1, max_length=200)
    parsed_buyin: Decimal | None = Field(default=None, ge=0)
    parsed_start_stack: int | None = Field(default=None, ge=0)
    parsed_late_reg_level: int | None = Field(default=None, ge=1)
    notes: str | None = None
    structure_sets: list[DraftStructureSet] = Field(min_length=1)
    matched_event_id: UUID | None = None
    match_confidence: Decimal | None = Field(default=None, ge=0, le=1)
    selected: bool = True
    is_shared_satellites: bool = False
    shared_event_ids: list[UUID] = Field(default_factory=list)
    issues: list[DraftCellIssue] = Field(default_factory=list)
    source_page: int | None = None

    @field_serializer("parsed_buyin", "match_confidence")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class ScheduleImportDraft(BaseModel):
    kind: Literal["schedule"] = "schedule"
    events: list[DraftEvent] = Field(default_factory=list)
    unparsed_rows: list[str] = Field(default_factory=list)
    confidence: Decimal | None = Field(default=None, ge=0, le=1)
    issues: list[DraftCellIssue] = Field(default_factory=list)
    series_notes: str | None = None


class StructureImportDraft(BaseModel):
    kind: Literal["structures"] = "structures"
    structures: list[DraftStructure] = Field(default_factory=list)
    confidence: Decimal | None = Field(default=None, ge=0, le=1)
    issues: list[DraftCellIssue] = Field(default_factory=list)
    unparsed_rows: list[str] = Field(default_factory=list)


ImportDraft = Annotated[
    ScheduleImportDraft | StructureImportDraft,
    Field(discriminator="kind"),
]


class ParseResult(BaseModel):
    events: list[DraftEvent] = Field(default_factory=list)
    unparsed_rows: list[str] = Field(default_factory=list)
    confidence: Decimal = Field(ge=0, le=1)
    parser_used: str | None = None
    parse_path: ParsePath = ParsePath.CODE
    tokens_input: int | None = None
    tokens_output: int | None = None
    estimated_cost_usd: Decimal | None = None
    issues: list[DraftCellIssue] = Field(default_factory=list)
    series_notes: str | None = None


class StructureParseResult(BaseModel):
    structures: list[DraftStructure] = Field(default_factory=list)
    unparsed_rows: list[str] = Field(default_factory=list)
    confidence: Decimal = Field(ge=0, le=1)
    parser_used: str | None = None
    parse_path: ParsePath = ParsePath.CODE
    tokens_input: int | None = None
    tokens_output: int | None = None
    estimated_cost_usd: Decimal | None = None
    issues: list[DraftCellIssue] = Field(default_factory=list)


class ImportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: ImportStatus
    import_kind: ImportKind = ImportKind.SCHEDULE
    original_filename: str
    content_type: str
    file_size: int
    file_sha256: str
    detected_type: str
    organizer_id: UUID | None
    series_id: UUID | None
    file_timezone: str | None = None
    parser_requested: str | None = None
    parser_used: str | None
    parse_path: ParsePath | None
    parser_mismatch_reason: str | None = None
    confidence: Decimal | None
    tokens_input: int | None
    tokens_output: int | None
    estimated_cost_usd: Decimal | None
    fields_total: int | None
    fields_corrected: int | None
    draft: ScheduleImportDraft | StructureImportDraft | None
    error: str | None
    created_at: datetime
    published_at: datetime | None

    @field_serializer("confidence", "estimated_cost_usd")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class ImportDraftUpdate(BaseModel):
    draft: ScheduleImportDraft | StructureImportDraft


class ImportPublishResponse(BaseModel):
    import_job_id: UUID
    series_id: UUID
    events_created: int = 0
    structures_applied: int = 0


class ImportPublishPreviewResponse(BaseModel):
    preview_token: str
    expires_in_seconds: int
    entity_type: Literal["import"] = "import"
    entity_id: UUID
    series_id: UUID
    import_kind: ImportKind = ImportKind.SCHEDULE
    diffs: list[FieldDiff]
    impacts: list[NotificationImpactItem]
    total_recipients: int = Field(ge=0)
    requires_confirmation: bool
    events_to_create: int = Field(default=0, ge=0)
    structures_to_apply: int = Field(default=0, ge=0)


class ImportStatsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_parse_path: dict[str, int]
    by_parser: dict[str, int]
    by_kind: dict[str, int] = Field(default_factory=dict)
    success_rate: Decimal | None
    avg_confidence: Decimal | None
    tokens_input: int
    tokens_output: int
    estimated_cost_usd: Decimal
    avg_correction_ratio: Decimal | None

    @field_serializer(
        "success_rate",
        "avg_confidence",
        "estimated_cost_usd",
        "avg_correction_ratio",
    )
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


def draft_from_parse_result(result: ParseResult) -> ScheduleImportDraft:
    return ScheduleImportDraft(
        events=result.events,
        unparsed_rows=result.unparsed_rows,
        confidence=result.confidence,
        issues=result.issues,
        series_notes=result.series_notes,
    )


def draft_from_structure_result(result: StructureParseResult) -> StructureImportDraft:
    return StructureImportDraft(
        structures=result.structures,
        unparsed_rows=result.unparsed_rows,
        confidence=result.confidence,
        issues=result.issues,
    )


def draft_to_dict(draft: ScheduleImportDraft | StructureImportDraft) -> dict[str, Any]:
    return draft.model_dump(mode="json")


def parse_import_draft(
    payload: dict[str, Any] | None,
) -> ScheduleImportDraft | StructureImportDraft | None:
    if payload is None:
        return None
    kind = payload.get("kind", "schedule")
    if kind == "bulk_xlsx":
        # Массовая загрузка живёт на своём экране со своим DTO (BulkImportDraft).
        return None
    if kind == "structures":
        return StructureImportDraft.model_validate(payload)
    # Backward-compatible schedule drafts without explicit kind.
    data = dict(payload)
    data.setdefault("kind", "schedule")
    return ScheduleImportDraft.model_validate(data)
