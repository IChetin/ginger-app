from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


def _validate_http_url(value: str) -> str:
    if not (value.startswith("http://") or value.startswith("https://")):
        raise ValueError("URL must start with http:// or https://")
    return value


class OrganizerCreate(BaseModel):
    """Союз клубов (NUTS, Black Sea, Poker21, ProSto)."""

    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64, pattern=_SLUG_PATTERN)
    links: dict[str, str] = Field(default_factory=dict)

    @field_validator("links")
    @classmethod
    def _links(cls, value: dict[str, str]) -> dict[str, str]:
        for url in value.values():
            _validate_http_url(url)
        return value


class OrganizerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    slug: str | None = Field(default=None, min_length=1, max_length=64, pattern=_SLUG_PATTERN)
    links: dict[str, str] | None = None

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
    clubs_count: int = 0
    created_at: datetime
    updated_at: datetime
