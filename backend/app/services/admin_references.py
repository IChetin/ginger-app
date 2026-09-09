from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.references import Country, Organizer, Venue
from app.models.schedule import Series
from app.schemas.admin_references import (
    OrganizerCreate,
    OrganizerRead,
    OrganizerUpdate,
    ParserInfo,
    VenueCreate,
    VenueRead,
    VenueUpdate,
)
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.schedule import CountryBrief
from app.services.admin_parsers import resolve_parser_profile
from app.services.organizer_logo import organizer_logo_url
from app.utils.logo_image import LogoValidationError, validate_logo_bytes
from app.utils.slugify import slugify


def _venue_read(venue: Venue, *, series_count: int = 0) -> VenueRead:
    return VenueRead(
        id=venue.id,
        country_code=venue.country_code,
        city=venue.city,
        name=venue.name,
        slug=venue.slug,
        zone=venue.zone,
        timezone=venue.timezone,
        address=venue.address,
        lat=venue.lat,
        lng=venue.lng,
        logo_url=venue.logo_url,
        country=CountryBrief(code=venue.country.code, name_ru=venue.country.name_ru),
        series_count=series_count,
        created_at=venue.created_at,
        updated_at=venue.updated_at,
    )


def _organizer_read(organizer: Organizer, *, series_count: int = 0) -> OrganizerRead:
    schedule = organizer.schedule_parser
    structure = organizer.structure_parser
    return OrganizerRead(
        id=organizer.id,
        name=organizer.name,
        slug=organizer.slug,
        links=organizer.links,
        logo_url=organizer_logo_url(organizer),
        series_count=series_count,
        schedule_parser_id=organizer.schedule_parser_id,
        structure_parser_id=organizer.structure_parser_id,
        schedule_parser_code=schedule.code if schedule else None,
        structure_parser_code=structure.code if structure else None,
        schedule_parser_title=schedule.title if schedule else None,
        structure_parser_title=structure.title if structure else None,
        created_at=organizer.created_at,
        updated_at=organizer.updated_at,
    )


async def _get_country(session: AsyncSession, country_code: str) -> Country:
    country = await session.get(Country, country_code)
    if country is None:
        raise NotFoundError(f"Country {country_code} not found")
    return country


async def _get_venue(session: AsyncSession, venue_id: UUID) -> Venue:
    stmt = select(Venue).where(Venue.id == venue_id).options(selectinload(Venue.country))
    venue = await session.scalar(stmt)
    if venue is None:
        raise NotFoundError("Venue not found")
    return venue


async def _get_organizer(session: AsyncSession, organizer_id: UUID) -> Organizer:
    organizer = await session.scalar(
        select(Organizer)
        .where(Organizer.id == organizer_id)
        .options(
            selectinload(Organizer.schedule_parser),
            selectinload(Organizer.structure_parser),
        )
    )
    if organizer is None:
        raise NotFoundError("Organizer not found")
    return organizer


async def _series_count_for_venues(session: AsyncSession, venue_ids: list[UUID]) -> dict[UUID, int]:
    if not venue_ids:
        return {}
    rows = await session.execute(
        select(Series.venue_id, func.count())
        .where(Series.venue_id.in_(venue_ids))
        .group_by(Series.venue_id)
    )
    return {venue_id: int(count) for venue_id, count in rows.all()}


async def _series_count_for_organizers(
    session: AsyncSession, organizer_ids: list[UUID]
) -> dict[UUID, int]:
    if not organizer_ids:
        return {}
    rows = await session.execute(
        select(Series.organizer_id, func.count())
        .where(Series.organizer_id.in_(organizer_ids))
        .group_by(Series.organizer_id)
    )
    return {organizer_id: int(count) for organizer_id, count in rows.all()}


async def _assert_organizer_slug_unique(
    session: AsyncSession,
    slug: str,
    *,
    exclude_id: UUID | None = None,
) -> None:
    stmt = select(Organizer.id).where(Organizer.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Organizer.id != exclude_id)
    if await session.scalar(stmt) is not None:
        raise ConflictError(f"Organizer slug '{slug}' already exists")


async def _assert_venue_slug_unique(
    session: AsyncSession,
    slug: str,
    *,
    exclude_id: UUID | None = None,
) -> None:
    stmt = select(Venue.id).where(Venue.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Venue.id != exclude_id)
    if await session.scalar(stmt) is not None:
        raise ConflictError(f"Venue slug '{slug}' already exists")


async def _unique_venue_slug(
    session: AsyncSession,
    base: str,
    *,
    exclude_id: UUID | None = None,
) -> str:
    candidate = base[:64]
    n = 2
    while True:
        stmt = select(Venue.id).where(Venue.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(Venue.id != exclude_id)
        if await session.scalar(stmt) is None:
            return candidate
        suffix = f"-{n}"
        candidate = f"{base[: 64 - len(suffix)]}{suffix}"
        n += 1


async def _assert_venue_unused(session: AsyncSession, venue_id: UUID) -> None:
    count = await session.scalar(
        select(func.count()).select_from(Series).where(Series.venue_id == venue_id)
    )
    if count:
        raise ConflictError(f"Нельзя удалить: привязано {count} серий")


async def _assert_organizer_unused(session: AsyncSession, organizer_id: UUID) -> None:
    count = await session.scalar(
        select(func.count()).select_from(Series).where(Series.organizer_id == organizer_id)
    )
    if count:
        raise ConflictError(f"Нельзя удалить: привязано {count} серий")


async def list_venues(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    search: str | None = None,
    country_code: str | None = None,
) -> PaginatedResponse[VenueRead]:
    base = select(Venue)
    if search:
        pattern = f"%{search.strip()}%"
        base = base.where(
            or_(
                Venue.name.ilike(pattern),
                Venue.city.ilike(pattern),
                Venue.slug.ilike(pattern),
            )
        )
    if country_code:
        base = base.where(Venue.country_code == country_code.upper())

    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = list(
        await session.scalars(
            base.options(selectinload(Venue.country))
            .order_by(Venue.city.asc(), Venue.name.asc())
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
    )
    counts = await _series_count_for_venues(session, [venue.id for venue in rows])
    return PaginatedResponse(
        items=[_venue_read(venue, series_count=counts.get(venue.id, 0)) for venue in rows],
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def get_venue(session: AsyncSession, venue_id: UUID) -> VenueRead:
    venue = await _get_venue(session, venue_id)
    counts = await _series_count_for_venues(session, [venue.id])
    return _venue_read(venue, series_count=counts.get(venue.id, 0))


async def create_venue(session: AsyncSession, data: VenueCreate) -> VenueRead:
    await _get_country(session, data.country_code)
    assert data.slug is not None
    slug = await _unique_venue_slug(session, data.slug)
    venue = Venue(
        country_code=data.country_code,
        city=data.city,
        name=data.name,
        slug=slug,
        zone=data.zone,
        timezone=data.timezone,
        address=data.address,
        lat=data.lat,
        lng=data.lng,
        logo_url=data.logo_url,
    )
    session.add(venue)
    await session.flush()
    venue = await _get_venue(session, venue.id)
    return _venue_read(venue, series_count=0)


async def update_venue(
    session: AsyncSession,
    venue_id: UUID,
    data: VenueUpdate,
) -> VenueRead:
    venue = await _get_venue(session, venue_id)
    payload = data.model_dump(exclude_unset=True)

    if "lat" in payload or "lng" in payload:
        lat = payload.get("lat", venue.lat)
        lng = payload.get("lng", venue.lng)
        if (lat is None) ^ (lng is None):
            raise AppError("validation_error", "lat and lng must be provided together", 400)

    if "country_code" in payload:
        await _get_country(session, payload["country_code"])

    if "slug" in payload and payload["slug"] is not None:
        await _assert_venue_slug_unique(session, payload["slug"], exclude_id=venue.id)

    for field, value in payload.items():
        setattr(venue, field, value)

    await session.flush()
    venue = await _get_venue(session, venue.id)
    counts = await _series_count_for_venues(session, [venue.id])
    return _venue_read(venue, series_count=counts.get(venue.id, 0))


async def delete_venue(session: AsyncSession, venue_id: UUID) -> None:
    venue = await _get_venue(session, venue_id)
    await _assert_venue_unused(session, venue.id)
    await session.delete(venue)
    await session.flush()


async def list_organizers(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    search: str | None = None,
) -> PaginatedResponse[OrganizerRead]:
    base = select(Organizer)
    if search:
        pattern = f"%{search.strip()}%"
        base = base.where(or_(Organizer.name.ilike(pattern), Organizer.slug.ilike(pattern)))
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = list(
        await session.scalars(
            base.options(
                selectinload(Organizer.schedule_parser),
                selectinload(Organizer.structure_parser),
            )
            .order_by(Organizer.name.asc())
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
    )
    counts = await _series_count_for_organizers(session, [item.id for item in rows])
    return PaginatedResponse(
        items=[_organizer_read(item, series_count=counts.get(item.id, 0)) for item in rows],
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def get_organizer(session: AsyncSession, organizer_id: UUID) -> OrganizerRead:
    organizer = await _get_organizer(session, organizer_id)
    counts = await _series_count_for_organizers(session, [organizer.id])
    return _organizer_read(organizer, series_count=counts.get(organizer.id, 0))


async def create_organizer(session: AsyncSession, data: OrganizerCreate) -> OrganizerRead:
    await _assert_organizer_slug_unique(session, data.slug)
    await resolve_parser_profile(
        session, data.schedule_parser_id, expected_kind="schedule"
    )
    await resolve_parser_profile(
        session, data.structure_parser_id, expected_kind="structures"
    )
    organizer = Organizer(
        name=data.name,
        slug=data.slug,
        links=data.links,
        schedule_parser_id=data.schedule_parser_id,
        structure_parser_id=data.structure_parser_id,
    )
    session.add(organizer)
    await session.flush()
    organizer = await _get_organizer(session, organizer.id)
    return _organizer_read(organizer, series_count=0)


async def update_organizer(
    session: AsyncSession,
    organizer_id: UUID,
    data: OrganizerUpdate,
) -> OrganizerRead:
    organizer = await _get_organizer(session, organizer_id)
    payload = data.model_dump(exclude_unset=True)
    if "slug" in payload:
        await _assert_organizer_slug_unique(session, payload["slug"], exclude_id=organizer.id)
    if "schedule_parser_id" in payload:
        await resolve_parser_profile(
            session, payload["schedule_parser_id"], expected_kind="schedule"
        )
    if "structure_parser_id" in payload:
        await resolve_parser_profile(
            session, payload["structure_parser_id"], expected_kind="structures"
        )
    for field, value in payload.items():
        setattr(organizer, field, value)
    await session.flush()
    organizer = await _get_organizer(session, organizer.id)
    counts = await _series_count_for_organizers(session, [organizer.id])
    return _organizer_read(organizer, series_count=counts.get(organizer.id, 0))


async def delete_organizer(session: AsyncSession, organizer_id: UUID) -> None:
    organizer = await _get_organizer(session, organizer_id)
    await _assert_organizer_unused(session, organizer.id)
    await session.delete(organizer)
    await session.flush()


async def upload_organizer_logo(
    session: AsyncSession,
    organizer_id: UUID,
    *,
    data: bytes,
    content_type: str | None,
) -> OrganizerRead:
    settings = get_settings()
    try:
        validated = validate_logo_bytes(
            data,
            declared_content_type=content_type,
            max_bytes=settings.logo_max_file_bytes,
            min_dimension=settings.logo_min_dimension,
        )
    except LogoValidationError as exc:
        raise AppError("validation_error", str(exc), status_code=422) from exc

    organizer = await _get_organizer(session, organizer_id)
    organizer.logo_data = validated.data
    organizer.logo_content_type = validated.content_type
    # Uploaded blob takes precedence; drop stale external logo links.
    links = dict(organizer.links or {})
    links.pop("logo", None)
    links.pop("logo_url", None)
    organizer.links = links
    await session.flush()
    organizer = await _get_organizer(session, organizer.id)
    counts = await _series_count_for_organizers(session, [organizer.id])
    return _organizer_read(organizer, series_count=counts.get(organizer.id, 0))


async def delete_organizer_logo(session: AsyncSession, organizer_id: UUID) -> OrganizerRead:
    organizer = await _get_organizer(session, organizer_id)
    organizer.logo_data = None
    organizer.logo_content_type = None
    await session.flush()
    organizer = await _get_organizer(session, organizer.id)
    counts = await _series_count_for_organizers(session, [organizer.id])
    return _organizer_read(organizer, series_count=counts.get(organizer.id, 0))


async def get_organizer_logo_bytes(
    session: AsyncSession,
    organizer_id: UUID,
) -> tuple[bytes, str]:
    from sqlalchemy.orm import undefer

    organizer = await session.scalar(
        select(Organizer)
        .where(Organizer.id == organizer_id)
        .options(undefer(Organizer.logo_data))
    )
    if organizer is None:
        raise NotFoundError("Organizer not found")
    data = organizer.logo_data
    content_type = organizer.logo_content_type
    if not data or not content_type:
        raise NotFoundError("Organizer logo not found")
    return data, content_type


async def list_parser_info(session: AsyncSession) -> list[ParserInfo]:
    from app.services.admin_parsers import list_parser_profiles

    return await list_parser_profiles(session)


# re-export for create auto-slug helpers if needed
__all__ = [
    "create_organizer",
    "create_venue",
    "delete_organizer",
    "delete_organizer_logo",
    "delete_venue",
    "get_organizer",
    "get_organizer_logo_bytes",
    "get_venue",
    "list_organizers",
    "list_parser_info",
    "list_venues",
    "slugify",
    "update_organizer",
    "update_venue",
    "upload_organizer_logo",
]
