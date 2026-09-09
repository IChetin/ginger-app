from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.enums import ChangeType, EventStatus, GameType, SeriesStatus
from app.schemas.schedule import (
    CountryBrief,
    CurrencyBrief,
    DateTimeWithTimezone,
    OrganizerBrief,
    VenueBrief,
)


class SeriesCreate(BaseModel):
    organizer_id: UUID
    venue_id: UUID
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    starts_on: date
    ends_on: date
    poster_url: str | None = None
    links: dict[str, str] = Field(default_factory=dict)
    description: str | None = None

    @model_validator(mode="after")
    def _dates(self) -> "SeriesCreate":
        if self.starts_on > self.ends_on:
            raise ValueError("starts_on must be <= ends_on")
        return self


class SeriesUpdate(BaseModel):
    organizer_id: UUID | None = None
    venue_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    starts_on: date | None = None
    ends_on: date | None = None
    status: SeriesStatus | None = None
    poster_url: str | None = None
    links: dict[str, str] | None = None
    description: str | None = None


class SeriesAdminRead(BaseModel):
    id: UUID
    organizer_id: UUID
    venue_id: UUID
    name: str
    slug: str
    starts_on: date
    ends_on: date
    status: SeriesStatus
    poster_url: str | None
    links: dict[str, str]
    description: str | None
    organizer: OrganizerBrief
    venue: VenueBrief
    country: CountryBrief
    events_count: int
    bookmarks_count: int = 0
    created_at: datetime
    updated_at: datetime


class ChangeLogAdminRead(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    change_type: ChangeType
    old_value: dict[str, object] | None
    new_value: dict[str, object] | None
    actor_id: UUID | None
    actor_email: str | None = None
    actor_nickname: str | None = None
    notified_at: datetime | None
    created_at: datetime


class ChangeLogListItem(ChangeLogAdminRead):
    series_id: UUID | None = None
    series_name: str | None = None
    event_id: UUID | None = None
    event_number: int | None = None
    event_name: str | None = None
    flight_label: str | None = None
    notifications_sent: int = 0
    notifications_failed: int = 0
    notifications_pending: int = 0
    via_import: bool = False


class EventCreate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    buyin: Decimal = Field(ge=0)
    buyin_bounty: Decimal | None = Field(default=None, gt=0)
    currency_code: str = Field(min_length=3, max_length=3)
    guarantee: Decimal | None = Field(default=None, ge=0)
    game_type: GameType = GameType.NLH
    tags: list[str] = Field(default_factory=list)
    start_stack: int | None = Field(default=None, ge=0)
    start_blinds: str | None = Field(default=None, max_length=32)
    reentry_count: int | None = Field(default=None, ge=0)
    reentry_unlimited: bool = False
    late_reg_level: int | None = Field(default=None, ge=1)
    day_end_note: str | None = Field(default=None, max_length=40)
    notes: str | None = None

    @field_validator("currency_code")
    @classmethod
    def _currency(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def _reentry(self) -> "EventCreate":
        if self.reentry_unlimited and self.reentry_count is not None:
            raise ValueError("reentry_count must be empty when reentry_unlimited is true")
        if self.buyin_bounty is not None and self.buyin_bounty >= self.buyin:
            raise ValueError("buyin_bounty must be less than buyin (buyin is total)")
        return self


class EventUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    buyin: Decimal | None = Field(default=None, ge=0)
    buyin_bounty: Decimal | None = Field(default=None, gt=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    guarantee: Decimal | None = Field(default=None, ge=0)
    game_type: GameType | None = None
    tags: list[str] | None = None
    start_stack: int | None = Field(default=None, ge=0)
    start_blinds: str | None = Field(default=None, max_length=32)
    reentry_count: int | None = Field(default=None, ge=0)
    reentry_unlimited: bool | None = None
    late_reg_level: int | None = Field(default=None, ge=1)
    day_end_note: str | None = Field(default=None, max_length=40)
    status: EventStatus | None = None
    notes: str | None = None

    @field_validator("currency_code")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class BlindLevelAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    structure_set_label: str = "default"
    level_no: int
    sb: int | None
    bb: int | None
    ante: int | None
    minutes: int
    is_break: bool
    is_late_reg_end: bool


class FlightAdminRead(BaseModel):
    id: UUID
    label: str | None
    start_at: DateTimeWithTimezone
    bookmarks_count: int = 0


class EventAdminRead(BaseModel):
    id: UUID
    series_id: UUID
    number: int | None
    name: str
    slug: str
    buyin: Decimal
    buyin_bounty: Decimal | None = None
    currency_code: str
    currency: CurrencyBrief
    guarantee: Decimal | None
    game_type: GameType
    tags: list[str]
    start_stack: int | None
    start_blinds: str | None = None
    reentry_count: int | None
    reentry_unlimited: bool
    late_reg_level: int | None
    day_end_note: str | None = None
    status: EventStatus
    notes: str | None
    flights: list[FlightAdminRead]
    blind_levels: list[BlindLevelAdminRead]
    bookmarks_count: int = 0
    created_at: datetime
    updated_at: datetime

    @field_serializer("buyin", "buyin_bounty", "guarantee")
    def serialize_money(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class FlightUpsert(BaseModel):
    id: UUID | None = None
    label: str | None = Field(default=None, max_length=16)
    start_at: datetime  # venue-local naive or aware


class BlindLevelUpsert(BaseModel):
    id: UUID | None = None
    structure_set_label: str = Field(default="default", max_length=16)
    level_no: int = Field(ge=1)
    sb: int | None = Field(default=None, ge=0)
    bb: int | None = Field(default=None, ge=0)
    ante: int | None = Field(default=None, ge=0)
    minutes: int = Field(gt=0)
    is_break: bool = False
    is_late_reg_end: bool = False

    @model_validator(mode="after")
    def _break_rules(self) -> "BlindLevelUpsert":
        if self.is_break and any(value is not None for value in (self.sb, self.bb, self.ante)):
            raise ValueError("break levels must have empty sb/bb/ante")
        label = self.structure_set_label.strip() or "default"
        self.structure_set_label = label
        return self
