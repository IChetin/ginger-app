from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from app.models.enums import EventStatus, GameType, SeriesStatus

CalendarCoverage = Literal["full", "partial"]


class CountryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name_ru: str


class CurrencyBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    symbol: str


class OrganizerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    logo_url: str | None = None


class SeriesHighlight(BaseModel):
    name: str
    date: date


class VenueBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    city: str
    country_code: str
    zone: str | None
    timezone: str
    address: str | None = None


class DateTimeWithTimezone(BaseModel):
    utc: datetime
    venue_local: datetime
    venue_timezone: str


class FlightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str | None
    start_at: DateTimeWithTimezone


class BlindLevelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    structure_set_label: str = "default"
    level_no: int
    sb: int | None
    bb: int | None
    ante: int | None
    minutes: int
    is_break: bool
    is_late_reg_end: bool


class EventSummary(BaseModel):
    id: UUID
    slug: str
    number: int | None
    name: str
    buyin: Decimal
    buyin_bounty: Decimal | None = None
    currency: CurrencyBrief
    guarantee: Decimal | None
    game_type: GameType
    tags: list[str]
    status: EventStatus
    start_stack: int | None
    start_blinds: str | None = None
    reentry_count: int | None
    reentry_unlimited: bool
    late_reg_level: int | None
    day_end_note: str | None = None
    # Full event flights (all days) so the client can render sibling chips.
    flights: list[FlightRead]

    @field_serializer("buyin", "buyin_bounty", "guarantee")
    def serialize_money(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class EventsDayGroup(BaseModel):
    date: date
    events: list[EventSummary]


class MinBuyinByCurrency(BaseModel):
    amount: Decimal
    currency: CurrencyBrief

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


class SeriesListItem(BaseModel):
    id: UUID
    slug: str
    name: str
    starts_on: date
    ends_on: date
    status: SeriesStatus
    poster_url: str | None
    organizer: OrganizerBrief
    venue: VenueBrief
    country: CountryBrief
    events_count: int
    days_until_start: int | None
    min_buyins: list[MinBuyinByCurrency] = Field(default_factory=list)
    today_events_count: int | None = None
    highlight: SeriesHighlight | None = None


class SeriesDetail(BaseModel):
    id: UUID
    slug: str
    name: str
    starts_on: date
    ends_on: date
    status: SeriesStatus
    poster_url: str | None
    description: str | None
    links: dict[str, str]
    organizer: OrganizerBrief
    venue: VenueBrief
    country: CountryBrief
    events_count: int
    days_until_start: int | None
    min_buyins: list[MinBuyinByCurrency] = Field(default_factory=list)
    today_events_count: int | None = None
    highlight: SeriesHighlight | None = None
    events_by_day: list[EventsDayGroup]


class EventDetail(BaseModel):
    id: UUID
    slug: str
    number: int | None
    name: str
    buyin: Decimal
    buyin_bounty: Decimal | None = None
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
    series: SeriesListItem
    venue: VenueBrief
    country: CountryBrief
    flights: list[FlightRead]
    blind_levels: list[BlindLevelRead]

    @field_serializer("buyin", "buyin_bounty", "guarantee")
    def serialize_money(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class SeriesScheduleRow(BaseModel):
    event_id: UUID
    event_slug: str
    flight_id: UUID
    number: int | None
    name: str
    flight_label: str | None
    start_at: DateTimeWithTimezone
    buyin: str
    buyin_bounty: str | None
    buyin_display: str
    guarantee: str | None
    guarantee_display: str | None
    game_type: GameType
    tags: list[str]
    pdf_tags: list[str]
    start_stack: int | None
    late_reg_level: int | None
    level_duration: str | None
    day_end_note: str | None
    highlight: str
    status: EventStatus


class SeriesScheduleDay(BaseModel):
    date: date
    label: str
    band_label: str
    events_count: int
    rows: list[SeriesScheduleRow]


class SeriesScheduleResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    starts_on: date
    ends_on: date
    status: SeriesStatus
    poster_url: str | None
    organizer: OrganizerBrief
    venue: VenueBrief
    country: CountryBrief
    currency: CurrencyBrief | None
    total_guarantee: str | None
    timezone_label: str
    date_range_label: str
    events_count: int
    days: list[SeriesScheduleDay]
    blinds_by_event: dict[str, list[BlindLevelRead]] | None = None


class CalendarSeriesMarker(BaseModel):
    id: UUID
    name: str
    status: SeriesStatus
    venue_city: str
    is_start: bool
    is_end: bool
    is_bookmarked: bool = False


class CalendarSeriesItem(SeriesListItem):
    is_bookmarked: bool = False
    # Period mode only (null when month-only request).
    coverage: CalendarCoverage | None = None
    overlap_starts_on: date | None = None
    overlap_ends_on: date | None = None
    events_in_period: int | None = None
    min_buyins_in_period: list[MinBuyinByCurrency] | None = None


class CalendarDay(BaseModel):
    date: date
    series: list[CalendarSeriesMarker]


class CalendarResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    month: str
    from_: date | None = Field(default=None, alias="from")
    to: date | None = None
    days: list[CalendarDay]
    series: list[CalendarSeriesItem]


class ScheduleFiltersResponse(BaseModel):
    countries: list[CountryBrief]
    zones: list[str]
    organizers: list[OrganizerBrief]
    statuses: list[SeriesStatus]
    game_types: list[GameType]
    tags: list[str]


class FilterFacetCount(BaseModel):
    value: str
    count: int


class ScheduleFilterCountsResponse(BaseModel):
    total: int
    countries: list[FilterFacetCount]
    organizers: list[FilterFacetCount]
    buyin: list[FilterFacetCount]


class SeriesTabCounts(BaseModel):
    """Home tab totals for the current subject filters (not the active status)."""

    all: int
    running: int
    archive: int


class SeriesListResponse(BaseModel):
    items: list[SeriesListItem]
    total: int
    limit: int
    offset: int
    counts: SeriesTabCounts


class SeriesListQuery(BaseModel):
    country_code: str | None = None
    country_codes: list[str] | None = None
    zone: str | None = None
    organizer_id: UUID | None = None
    organizer_ids: list[UUID] | None = None
    venue_ids: list[UUID] | None = None
    # None = default feed; "actual" = announced|schedule_published|running;
    # "live_soon"/"upcoming" = schedule_published|running;
    # "running" = actual statuses whose dates cover today (home «Идут»);
    # "announced" = announced with starts_on > today (legacy home «Анонсы»);
    # else exact SeriesStatus value (finished/cancelled/schedule_published).
    status: str | None = None
    starts_from: date | None = None
    starts_to: date | None = None
    buyin_min: Decimal | None = None
    buyin_max: Decimal | None = None
    # Presets: lt10k | 10-50k | gte50k (amounts in base_currency after FX).
    buyin_presets: list[str] | None = None
    base_currency: str = "RUB"
    game_type: GameType | None = None
    tags: list[str] | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class CalendarQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    from_: date | None = Field(default=None, alias="from")
    to: date | None = None
    country_code: str | None = None
    zone: str | None = None
    organizer_id: UUID | None = None
    status: SeriesStatus | None = None
    buyin_min: Decimal | None = None
    buyin_max: Decimal | None = None
    game_type: GameType | None = None
    tags: list[str] | None = None

    @model_validator(mode="after")
    def _require_both_period_bounds(self) -> "CalendarQuery":
        if (self.from_ is None) ^ (self.to is None):
            raise ValueError("from and to must be provided together")
        return self
