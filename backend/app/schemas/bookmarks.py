from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.reminders import normalize_reminder_offsets
from app.models.enums import BookmarkTarget, SeriesStatus
from app.schemas.schedule import DateTimeWithTimezone


class BookmarkCreate(BaseModel):
    target_type: BookmarkTarget
    target_id: UUID
    reminder_offsets: list[int] | None = None


class BookmarkUpdate(BaseModel):
    reminder_offsets: list[int]


class GuestBookmarkItem(BaseModel):
    target_type: BookmarkTarget
    target_id: UUID
    reminder_offsets: list[int] | None = None


class BookmarkMigrateBody(BaseModel):
    items: list[GuestBookmarkItem] = Field(default_factory=list, max_length=100)


class BookmarkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    target_type: BookmarkTarget
    target_id: UUID
    reminder_offsets: list[int]
    created_at: datetime


class BookmarkMigrateResponse(BaseModel):
    created: int
    skipped: int
    items: list[BookmarkRead]


class BookmarkDisplayFields(BaseModel):
    """Structured display fields shared by overview and guest resolve."""

    series_id: UUID | None
    event_id: UUID | None
    series_name: str
    series_status: SeriesStatus
    series_starts_on: date
    series_ends_on: date
    organizer_name: str
    organizer_slug: str
    venue_name: str
    venue_city: str
    event_number: int | None = None
    event_name: str | None = None
    flight_label: str | None = None
    nearest_start_at: DateTimeWithTimezone | None
    url: str


class BookmarkOverviewItem(BookmarkDisplayFields):
    id: UUID
    target_type: BookmarkTarget
    target_id: UUID
    reminder_offsets: list[int]
    created_at: datetime
    # Backward-compatible string fields for older clients.
    title: str
    subtitle: str | None


class BookmarkTargetResolveRef(BaseModel):
    target_type: BookmarkTarget
    target_id: UUID


class BookmarkTargetResolveBody(BaseModel):
    items: list[BookmarkTargetResolveRef] = Field(default_factory=list, max_length=100)


class BookmarkTargetResolveItem(BaseModel):
    target_type: BookmarkTarget
    target_id: UUID
    found: bool
    display: BookmarkDisplayFields | None = None


class BookmarkTargetResolveResponse(BaseModel):
    items: list[BookmarkTargetResolveItem]


def resolve_reminder_offsets(
    target_type: BookmarkTarget,
    offsets: list[int] | None,
    *,
    profile_defaults: list[int],
) -> list[int]:
    if target_type == BookmarkTarget.SERIES:
        if offsets is None:
            return []
        return normalize_reminder_offsets(offsets, allow_empty=True)
    if offsets is None:
        return normalize_reminder_offsets(profile_defaults, allow_empty=False)
    return normalize_reminder_offsets(offsets, allow_empty=False)
