from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_serializer

from app.models.enums import SeriesStatus
from app.schemas.schedule import DateTimeWithTimezone


class SearchSeriesItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    status: SeriesStatus
    starts_on: date
    ends_on: date
    venue_name: str
    venue_city: str
    organizer_name: str
    organizer_slug: str
    events_count: int


class SearchVenueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    city: str
    country_code: str
    zone: str | None
    series_count: int


class SearchEventItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    number: int | None
    name: str
    series_id: UUID
    series_slug: str
    series_name: str
    buyin: Decimal
    currency_code: str
    nearest_start_at: DateTimeWithTimezone | None

    @field_serializer("buyin")
    def serialize_buyin(self, value: Decimal) -> str:
        return format(value, "f")


class SearchGroup[T](BaseModel):
    items: list[T]
    total: int
    has_more: bool


class SearchResponse(BaseModel):
    q: str
    series: SearchGroup[SearchSeriesItem]
    venues: SearchGroup[SearchVenueItem]
    events: SearchGroup[SearchEventItem]
