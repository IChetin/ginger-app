from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer, field_validator


class StatsFilterParams(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    series_id: UUID | None = None
    series_ids: list[UUID] | None = None
    # Include results without a linked series/event ("Без серии").
    include_unlinked: bool = False
    venue_id: UUID | None = None
    venue_ids: list[UUID] | None = None
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    buyin_min: Decimal | None = Field(default=None, ge=0)
    buyin_max: Decimal | None = Field(default=None, ge=0)
    # Presets: lt10k | 10-50k | gte50k (amounts in user base currency after FX).
    buyin_presets: list[str] | None = None
    # itm / no_itm — multi; empty = no filter.
    result_kinds: list[str] | None = None

    @field_validator("country_code")
    @classmethod
    def _country(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class StatsSummary(BaseModel):
    base_currency: str
    tournaments: int
    entries: int
    invested: Decimal
    won: Decimal
    profit: Decimal
    roi: Decimal | None
    abi: Decimal | None
    itm: Decimal

    @field_serializer("invested", "won", "profit", "roi", "abi", "itm")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class StatsChartPoint(BaseModel):
    index: int
    result_id: UUID
    played_on: date
    label: str
    profit: Decimal
    cumulative_profit: Decimal

    @field_serializer("profit", "cumulative_profit")
    def serialize_decimal(self, value: Decimal) -> str:
        return format(value, "f")


class StatsChartResponse(BaseModel):
    base_currency: str
    points: list[StatsChartPoint]


class StatsFilterOption(BaseModel):
    id: UUID
    name: str


class StatsCountryOption(BaseModel):
    code: str
    name_ru: str


class StatsFiltersResponse(BaseModel):
    series: list[StatsFilterOption]
    venues: list[StatsFilterOption]
    countries: list[StatsCountryOption]
    unlinked_count: int = 0


class StatsFacetCount(BaseModel):
    value: str
    count: int


class StatsFilterCountsResponse(BaseModel):
    total: int
    series: list[StatsFacetCount]
    venues: list[StatsFacetCount]
    buyin: list[StatsFacetCount]
    result: list[StatsFacetCount]
