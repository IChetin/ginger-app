from datetime import datetime
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

from app.schemas.schedule import CountryBrief
from app.utils.slugify import is_valid_slug, slugify
from app.utils.timezone import validate_iana_timezone


def _validate_http_url(value: str | None) -> str | None:
    if value is None:
        return None
    if not (value.startswith("http://") or value.startswith("https://")):
        raise ValueError("URL must start with http:// or https://")
    return value


class VenueCreate(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)
    city: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    slug: str | None = Field(default=None, min_length=1, max_length=64)
    zone: str | None = Field(default=None, max_length=64)
    timezone: str = Field(min_length=1, max_length=64)
    address: str | None = None
    lat: Decimal | None = Field(default=None, ge=-90, le=90)
    lng: Decimal | None = Field(default=None, ge=-180, le=180)
    logo_url: str | None = None

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, value: str) -> str:
        return validate_iana_timezone(value)

    @field_validator("country_code")
    @classmethod
    def _country(cls, value: str) -> str:
        return value.upper()

    @field_validator("logo_url")
    @classmethod
    def _logo_url(cls, value: str | None) -> str | None:
        return _validate_http_url(value)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not is_valid_slug(normalized):
            raise ValueError("slug must be lowercase latin with optional hyphens")
        return normalized

    @model_validator(mode="after")
    def _finalize(self) -> "VenueCreate":
        if (self.lat is None) ^ (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        if self.slug:
            return self
        return self.model_copy(update={"slug": slugify(self.name, fallback="venue")})


class VenueUpdate(BaseModel):
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    city: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    slug: str | None = Field(default=None, min_length=1, max_length=64)
    zone: str | None = Field(default=None, max_length=64)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    address: str | None = None
    lat: Decimal | None = Field(default=None, ge=-90, le=90)
    lng: Decimal | None = Field(default=None, ge=-180, le=180)
    logo_url: str | None = None

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_iana_timezone(value)

    @field_validator("country_code")
    @classmethod
    def _country(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @field_validator("logo_url")
    @classmethod
    def _logo_url(cls, value: str | None) -> str | None:
        return _validate_http_url(value)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not is_valid_slug(normalized):
            raise ValueError("slug must be lowercase latin with optional hyphens")
        return normalized


class VenueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    country_code: str
    city: str
    name: str
    slug: str
    zone: str | None
    timezone: str
    address: str | None
    lat: Decimal | None
    lng: Decimal | None
    logo_url: str | None
    country: CountryBrief
    series_count: int = 0
    created_at: datetime
    updated_at: datetime

    @field_serializer("lat", "lng")
    def serialize_coords(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class OrganizerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    links: dict[str, str] = Field(default_factory=dict)
    schedule_parser_id: UUID | None = None
    structure_parser_id: UUID | None = None

    @field_validator("links")
    @classmethod
    def _links(cls, value: dict[str, str]) -> dict[str, str]:
        for url in value.values():
            _validate_http_url(url)
        return value


class OrganizerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    slug: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    links: dict[str, str] | None = None
    schedule_parser_id: UUID | None = None
    structure_parser_id: UUID | None = None

    @field_validator("links")
    @classmethod
    def _links(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        for url in value.values():
            _validate_http_url(url)
        return value


class OrganizerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    links: dict[str, str]
    logo_url: str | None = None
    series_count: int = 0
    schedule_parser_id: UUID | None = None
    structure_parser_id: UUID | None = None
    schedule_parser_code: str | None = None
    structure_parser_code: str | None = None
    schedule_parser_title: str | None = None
    structure_parser_title: str | None = None
    created_at: datetime
    updated_at: datetime


class ParserOrganizerBrief(BaseModel):
    id: UUID
    name: str
    slug: str


class ParserInfo(BaseModel):
    """Parser profile for admin list / import picker (DB + registry metadata)."""

    id: UUID
    name: str  # code — used as parser_requested value
    title: str
    kind: str
    organizer_slugs: list[str] = []  # legacy hints from code registry
    supported_types: list[str] = []
    description: str = ""
    is_active: bool = True
    is_available: bool = True
    notes: str | None = None
    organizers: list[ParserOrganizerBrief] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ParserProfileUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=128)
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)
