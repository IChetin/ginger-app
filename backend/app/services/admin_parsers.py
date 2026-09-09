"""Admin CRUD for parser_profiles (read + update title/active/notes)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models.imports import ParserProfile
from app.schemas.admin_references import ParserInfo, ParserOrganizerBrief, ParserProfileUpdate
from app.services.parser_profiles import sync_parser_profiles


def _registry_meta(code: str) -> tuple[list[str], list[str], str]:
    from app.services.imports.parsers import register_builtin_parsers
    from app.services.imports.registry import list_parsers, list_structure_parsers

    register_builtin_parsers()
    for parser in list_parsers():
        if parser.name == code:
            supported = getattr(parser, "supported_types", frozenset())
            return (
                sorted(parser.organizer_slugs),
                sorted(supported),
                str(getattr(parser, "description", "") or ""),
            )
    for parser in list_structure_parsers():
        if parser.name == code:
            supported = getattr(parser, "supported_types", frozenset())
            return (
                sorted(parser.organizer_slugs),
                sorted(supported),
                str(getattr(parser, "description", "") or ""),
            )
    return [], [], ""


def _profile_to_info(profile: ParserProfile) -> ParserInfo:
    slugs, types, description = _registry_meta(profile.code)
    organizers: list[ParserOrganizerBrief] = []
    seen: set[UUID] = set()
    for org in list(profile.organizers_schedule) + list(profile.organizers_structure):
        if org.id in seen:
            continue
        seen.add(org.id)
        organizers.append(ParserOrganizerBrief(id=org.id, name=org.name, slug=org.slug))
    organizers.sort(key=lambda item: item.name.lower())
    return ParserInfo(
        id=profile.id,
        name=profile.code,
        title=profile.title,
        kind=profile.kind,
        organizer_slugs=slugs,
        supported_types=types,
        description=description,
        is_active=profile.is_active,
        is_available=profile.is_available,
        notes=profile.notes,
        organizers=organizers,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


async def _load_profile(session: AsyncSession, profile_id: UUID) -> ParserProfile:
    profile = await session.scalar(
        select(ParserProfile)
        .where(ParserProfile.id == profile_id)
        .options(
            selectinload(ParserProfile.organizers_schedule),
            selectinload(ParserProfile.organizers_structure),
        )
    )
    if profile is None:
        raise NotFoundError("Parser profile not found")
    return profile


async def list_parser_profiles(session: AsyncSession) -> list[ParserInfo]:
    await sync_parser_profiles(session)
    rows = list(
        await session.scalars(
            select(ParserProfile)
            .options(
                selectinload(ParserProfile.organizers_schedule),
                selectinload(ParserProfile.organizers_structure),
            )
            .order_by(ParserProfile.kind.asc(), ParserProfile.title.asc())
        )
    )
    return [_profile_to_info(row) for row in rows]


async def get_parser_profile(session: AsyncSession, profile_id: UUID) -> ParserInfo:
    await sync_parser_profiles(session)
    profile = await _load_profile(session, profile_id)
    return _profile_to_info(profile)


async def update_parser_profile(
    session: AsyncSession,
    profile_id: UUID,
    data: ParserProfileUpdate,
) -> ParserInfo:
    profile = await _load_profile(session, profile_id)
    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(profile, field, value)
    await session.flush()
    await session.refresh(profile)
    # Re-load relationships after refresh.
    profile = await _load_profile(session, profile.id)
    return _profile_to_info(profile)


async def resolve_parser_profile(
    session: AsyncSession,
    profile_id: UUID | None,
    *,
    expected_kind: str,
) -> ParserProfile | None:
    """Validate organizer binding: profile exists, kind matches, active+available."""
    if profile_id is None:
        return None
    profile = await session.get(ParserProfile, profile_id)
    if profile is None:
        from app.core.exceptions import AppError

        raise AppError("validation_error", "Parser profile not found", 400)
    if profile.kind != expected_kind:
        from app.core.exceptions import AppError

        raise AppError(
            "validation_error",
            f"Parser «{profile.code}» has kind={profile.kind}, expected {expected_kind}",
            400,
        )
    if not profile.is_available:
        from app.core.exceptions import AppError

        raise AppError(
            "validation_error",
            f"Parser «{profile.code}» is no longer available in the registry",
            400,
        )
    if not profile.is_active:
        from app.core.exceptions import AppError

        raise AppError(
            "validation_error",
            f"Parser «{profile.title}» is disabled",
            400,
        )
    return profile
