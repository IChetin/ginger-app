"""Slug generation, uniqueness, resolve, and redirects for series/events."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models.references import Organizer, Venue
from app.models.schedule import Event, Series, SlugRedirect
from app.services.paths import event_canonical_path, event_public_key, series_canonical_path
from app.utils.slugify import (
    SERIES_EVENT_SLUG_MAX_LEN,
    is_valid_slug,
    looks_like_uuid,
    slugify,
    with_unique_suffix,
)

__all__ = [
    "allocate_event_slug",
    "allocate_series_slug",
    "build_event_slug_base",
    "build_series_slug_base",
    "change_event_slug",
    "change_series_slug",
    "ensure_event_slug",
    "ensure_series_slug",
    "event_canonical_path",
    "record_redirect",
    "resolve_event",
    "resolve_event_id",
    "resolve_series",
    "resolve_series_id",
    "series_canonical_path",
]

EntityType = str  # "series" | "event"


def build_series_slug_base(
    *,
    organizer_slug: str,
    city: str,
    starts_on: date,
) -> str:
    org = slugify(organizer_slug, fallback="org", max_len=SERIES_EVENT_SLUG_MAX_LEN)
    city_part = slugify(city, fallback="city", max_len=SERIES_EVENT_SLUG_MAX_LEN)
    period = f"{starts_on.year}-{starts_on.month:02d}"
    raw = f"{org}-{city_part}-{period}"
    return slugify(raw, fallback="series", max_len=SERIES_EVENT_SLUG_MAX_LEN)


def build_event_slug_base(*, number: int | None, name: str) -> str:
    name_part = slugify(name, fallback="event", max_len=SERIES_EVENT_SLUG_MAX_LEN)
    if number is None:
        return name_part
    raw = f"{number}-{name_part}"
    return slugify(raw, fallback="event", max_len=SERIES_EVENT_SLUG_MAX_LEN)


async def _taken_series_slugs(session: AsyncSession, *, exclude_id: UUID | None = None) -> set[str]:
    stmt: Select[tuple[str]] = select(Series.slug)
    if exclude_id is not None:
        stmt = stmt.where(Series.id != exclude_id)
    rows = await session.scalars(stmt)
    return set(rows.all())


async def _taken_event_slugs(
    session: AsyncSession,
    series_id: UUID,
    *,
    exclude_id: UUID | None = None,
) -> set[str]:
    stmt = select(Event.slug).where(Event.series_id == series_id)
    if exclude_id is not None:
        stmt = stmt.where(Event.id != exclude_id)
    rows = await session.scalars(stmt)
    return set(rows.all())


async def allocate_series_slug(
    session: AsyncSession,
    *,
    organizer_slug: str,
    city: str,
    starts_on: date,
    exclude_id: UUID | None = None,
    preferred: str | None = None,
) -> str:
    taken = await _taken_series_slugs(session, exclude_id=exclude_id)
    if preferred is not None:
        base = slugify(preferred, fallback="series", max_len=SERIES_EVENT_SLUG_MAX_LEN)
        if not is_valid_slug(base):
            raise ConflictError("Invalid series slug")
    else:
        base = build_series_slug_base(
            organizer_slug=organizer_slug,
            city=city,
            starts_on=starts_on,
        )
    return with_unique_suffix(base, taken, max_len=SERIES_EVENT_SLUG_MAX_LEN)


async def allocate_event_slug(
    session: AsyncSession,
    series_id: UUID,
    *,
    number: int | None,
    name: str,
    exclude_id: UUID | None = None,
    preferred: str | None = None,
) -> str:
    taken = await _taken_event_slugs(session, series_id, exclude_id=exclude_id)
    if preferred is not None:
        base = slugify(preferred, fallback="event", max_len=SERIES_EVENT_SLUG_MAX_LEN)
        if not is_valid_slug(base):
            raise ConflictError("Invalid event slug")
    else:
        base = build_event_slug_base(number=number, name=name)
    return with_unique_suffix(base, taken, max_len=SERIES_EVENT_SLUG_MAX_LEN)


async def record_redirect(
    session: AsyncSession,
    *,
    entity_type: EntityType,
    entity_id: UUID,
    old_slug: str,
) -> None:
    if not old_slug:
        return
    existing = await session.scalar(
        select(SlugRedirect).where(
            SlugRedirect.entity_type == entity_type,
            SlugRedirect.old_slug == old_slug,
        )
    )
    if existing is not None:
        existing.entity_id = entity_id
        return
    session.add(
        SlugRedirect(
            entity_type=entity_type,
            entity_id=entity_id,
            old_slug=old_slug,
        )
    )


async def change_series_slug(
    session: AsyncSession,
    series: Series,
    new_slug: str,
) -> None:
    cleaned = slugify(new_slug, fallback="series", max_len=SERIES_EVENT_SLUG_MAX_LEN)
    if not is_valid_slug(cleaned):
        raise ConflictError("Invalid series slug")
    if cleaned == series.slug:
        return

    taken = await _taken_series_slugs(session, exclude_id=series.id)
    if cleaned in taken:
        raise ConflictError(f"Series slug '{cleaned}' already exists")

    old_slug = series.slug
    # Redirects for compound event URLs that embed the series slug.
    events = (
        await session.scalars(select(Event).where(Event.series_id == series.id))
    ).all()
    for event in events:
        await record_redirect(
            session,
            entity_type="event",
            entity_id=event.id,
            old_slug=event_public_key(series_slug=old_slug, event_slug=event.slug),
        )

    await record_redirect(
        session,
        entity_type="series",
        entity_id=series.id,
        old_slug=old_slug,
    )
    series.slug = cleaned


async def change_event_slug(
    session: AsyncSession,
    event: Event,
    new_slug: str,
    *,
    series_slug: str,
) -> None:
    cleaned = slugify(new_slug, fallback="event", max_len=SERIES_EVENT_SLUG_MAX_LEN)
    if not is_valid_slug(cleaned):
        raise ConflictError("Invalid event slug")
    if cleaned == event.slug:
        return

    taken = await _taken_event_slugs(session, event.series_id, exclude_id=event.id)
    if cleaned in taken:
        raise ConflictError(f"Event slug '{cleaned}' already exists in this series")

    await record_redirect(
        session,
        entity_type="event",
        entity_id=event.id,
        old_slug=event_public_key(series_slug=series_slug, event_slug=event.slug),
    )
    event.slug = cleaned


async def ensure_series_slug(
    session: AsyncSession,
    series: Series,
    *,
    organizer: Organizer,
    venue: Venue,
) -> None:
    if series.slug:
        return
    series.slug = await allocate_series_slug(
        session,
        organizer_slug=organizer.slug,
        city=venue.city,
        starts_on=series.starts_on,
        exclude_id=series.id,
    )


async def ensure_event_slug(session: AsyncSession, event: Event) -> None:
    if event.slug:
        return
    event.slug = await allocate_event_slug(
        session,
        event.series_id,
        number=event.number,
        name=event.name,
        exclude_id=event.id,
    )


async def resolve_series_id(session: AsyncSession, key: str) -> UUID:
    if looks_like_uuid(key):
        return UUID(key)

    series_id = await session.scalar(select(Series.id).where(Series.slug == key))
    if series_id is not None:
        return series_id

    redirected = await session.scalar(
        select(SlugRedirect.entity_id).where(
            SlugRedirect.entity_type == "series",
            SlugRedirect.old_slug == key,
        )
    )
    if redirected is not None:
        return redirected

    raise NotFoundError("Series not found")


async def resolve_series(session: AsyncSession, key: str) -> Series:
    series_id = await resolve_series_id(session, key)
    series = await session.scalar(
        select(Series)
        .where(Series.id == series_id)
        .options(
            selectinload(Series.organizer),
            selectinload(Series.venue).selectinload(Venue.country),
        )
    )
    if series is None:
        raise NotFoundError("Series not found")
    return series


async def resolve_event_id(session: AsyncSession, key: str) -> UUID:
    if looks_like_uuid(key):
        return UUID(key)

    # Compound public key: {series.slug}-{event.slug}
    event_id = await session.scalar(
        select(Event.id)
        .join(Series, Series.id == Event.series_id)
        .where(func.concat(Series.slug, "-", Event.slug) == key)
    )
    if event_id is not None:
        return event_id

    redirected = await session.scalar(
        select(SlugRedirect.entity_id).where(
            SlugRedirect.entity_type == "event",
            SlugRedirect.old_slug == key,
        )
    )
    if redirected is not None:
        return redirected

    raise NotFoundError("Event not found")


async def resolve_event(session: AsyncSession, key: str) -> Event:
    event_id = await resolve_event_id(session, key)
    event = await session.scalar(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.series))
    )
    if event is None:
        raise NotFoundError("Event not found")
    return event

