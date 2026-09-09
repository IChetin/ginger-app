"""Public path builders for series/events (canonical slug URLs)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.schedule import Event, Series


def event_public_key(*, series_slug: str, event_slug: str) -> str:
    return f"{series_slug}-{event_slug}"


def series_canonical_path(series: Series) -> str:
    return f"/series/{series.slug}"


def event_canonical_path(event: Event, *, series_slug: str | None = None) -> str:
    slug = series_slug if series_slug is not None else event.series.slug
    return f"/events/{event_public_key(series_slug=slug, event_slug=event.slug)}"


# Aliases used across notification/bookmark builders.
series_path = series_canonical_path
event_path = event_canonical_path
