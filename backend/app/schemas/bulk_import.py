"""DTO массовой загрузки серий из Excel-шаблона (`import_kind=bulk_xlsx`).

Черновик (`Bulk*Draft`) — то, что вычитано из файла; план (`Bulk*Plan`) — то, что
произойдёт с базой при публикации. Черновик живёт в `import_jobs.draft`, план
считается заново на каждый запрос предпросмотра.
"""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer

from app.models.enums import EventStatus, GameType, ImportStatus
from app.schemas.notifications import NotificationImpactItem

IssueSeverity = Literal["error", "warning"]
BulkAction = Literal["create", "update", "unchanged", "missing"]


class BulkIssue(BaseModel):
    """Замечание с адресом ячейки: строка листа и буква колонки."""

    severity: IssueSeverity
    code: str
    message: str
    row: int | None = None
    column: str | None = None
    field: str | None = None
    series_key: str | None = None


class BulkFlightDraft(BaseModel):
    label: str | None = Field(default=None, max_length=16)
    play_date: date
    play_time: time
    level_minutes: str | None = Field(default=None, max_length=16)
    is_final: bool = False
    source_row: int


class BulkEventDraft(BaseModel):
    import_key: str = Field(min_length=1, max_length=64)
    number: int | None = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=160)
    buyin: Decimal = Field(ge=0)
    buyin_bounty: Decimal | None = Field(default=None, ge=0)
    currency_code: str = Field(min_length=3, max_length=3)
    guarantee: Decimal | None = Field(default=None, ge=0)
    # None = ячейка пуста. При создании берётся значение по умолчанию, при
    # обновлении поле не трогаем: пустая ячейка не должна стирать данные в базе.
    game_type: GameType | None = None
    tags: list[str] = Field(default_factory=list)
    start_stack: int | None = Field(default=None, ge=0)
    start_blinds: str | None = Field(default=None, max_length=32)
    reentry_count: int | None = Field(default=None, ge=0)
    reentry_unlimited: bool = False
    late_reg_level: int | None = Field(default=None, ge=1)
    day_end_note: str | None = Field(default=None, max_length=40)
    status: EventStatus | None = None
    notes: str | None = None
    flights: list[BulkFlightDraft] = Field(min_length=1)
    source_row: int

    @field_serializer("buyin", "buyin_bounty", "guarantee")
    def _money(self, value: Decimal | None) -> str | None:
        return None if value is None else format(value, "f")


class BulkSeriesDraft(BaseModel):
    import_key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    organizer_name: str = Field(min_length=1, max_length=128)
    venue_name: str = Field(min_length=1, max_length=128)
    city: str = Field(min_length=1, max_length=64)
    country_code: str = Field(min_length=2, max_length=2)
    timezone: str = Field(min_length=1, max_length=64)
    starts_on: date
    ends_on: date
    currency_code: str = Field(min_length=3, max_length=3)
    guarantee: Decimal | None = Field(default=None, ge=0)
    poster_url: str | None = None
    source_url: str | None = None
    events: list[BulkEventDraft] = Field(default_factory=list)
    source_row: int

    @field_serializer("guarantee")
    def _money(self, value: Decimal | None) -> str | None:
        return None if value is None else format(value, "f")


class BulkPublishReport(BaseModel):
    series_created: int = 0
    series_updated: int = 0
    events_created: int = 0
    events_updated: int = 0
    events_cancelled: int = 0
    flights_created: int = 0
    flights_updated: int = 0
    organizers_created: list[str] = Field(default_factory=list)
    venues_created: list[str] = Field(default_factory=list)
    countries_created: list[str] = Field(default_factory=list)
    notifications_enqueued: int = 0
    notifications_suppressed: bool = False


class BulkImportDraft(BaseModel):
    kind: Literal["bulk_xlsx"] = "bulk_xlsx"
    series: list[BulkSeriesDraft] = Field(default_factory=list)
    issues: list[BulkIssue] = Field(default_factory=list)
    demo_rows_skipped: list[int] = Field(default_factory=list)
    empty_rows_skipped: int = 0
    rows_total: int = 0
    # Буквы колонок листа: адрес ячейки нужен и на этапе проверок против базы,
    # когда исходный файл уже не читается.
    column_letters: dict[str, str] = Field(default_factory=dict)
    report: BulkPublishReport | None = None

    @property
    def has_errors(self) -> bool:
        return any(item.severity == "error" for item in self.issues)


class BulkJobRead(BaseModel):
    id: UUID
    status: ImportStatus
    original_filename: str
    file_size: int
    file_sha256: str
    draft: BulkImportDraft | None
    error: str | None
    created_at: datetime
    published_at: datetime | None


class BulkFieldDiff(BaseModel):
    field: str
    label: str
    old_value: str | None
    new_value: str | None


class BulkFlightPlan(BaseModel):
    label: str | None
    action: BulkAction
    starts_at_local: str | None = None
    diffs: list[BulkFieldDiff] = Field(default_factory=list)


class BulkEventPlan(BaseModel):
    import_key: str | None
    name: str
    action: BulkAction
    diffs: list[BulkFieldDiff] = Field(default_factory=list)
    flights: list[BulkFlightPlan] = Field(default_factory=list)
    recipients: int = 0


class BulkSeriesPlan(BaseModel):
    import_key: str
    name: str
    action: BulkAction
    series_id: UUID | None = None
    diffs: list[BulkFieldDiff] = Field(default_factory=list)
    events: list[BulkEventPlan] = Field(default_factory=list)
    recipients: int = 0
    warnings: list[BulkIssue] = Field(default_factory=list)


class BulkNewVenue(BaseModel):
    name: str
    city: str
    country_code: str
    timezone: str


class BulkNewReferences(BaseModel):
    organizers: list[str] = Field(default_factory=list)
    venues: list[BulkNewVenue] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not (self.organizers or self.venues or self.countries)


class BulkCounts(BaseModel):
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    missing: int = 0


class BulkPreviewResponse(BaseModel):
    preview_token: str
    expires_in_seconds: int
    job_id: UUID
    mark_missing_cancelled: bool
    series: BulkCounts
    events: BulkCounts
    flights: BulkCounts
    plans: list[BulkSeriesPlan] = Field(default_factory=list)
    new_references: BulkNewReferences
    impacts: list[NotificationImpactItem] = Field(default_factory=list)
    total_recipients: int = Field(default=0, ge=0)
    issues: list[BulkIssue] = Field(default_factory=list)
    can_publish: bool


class BulkPublishRequest(BaseModel):
    mark_missing_cancelled: bool = False


class BulkPublishResponse(BaseModel):
    job_id: UUID
    report: BulkPublishReport
