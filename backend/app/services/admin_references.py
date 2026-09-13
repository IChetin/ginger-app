"""Справочник союзов в админке. К союзу привязаны клубы, по нему выбирается парсер сетки."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.clubs import Club
from app.models.references import Organizer
from app.schemas.admin_references import OrganizerCreate, OrganizerRead, OrganizerUpdate
from app.schemas.common import PaginatedResponse, PaginationParams


def _organizer_read(organizer: Organizer, *, clubs_count: int = 0) -> OrganizerRead:
    return OrganizerRead(
        id=organizer.id,
        name=organizer.name,
        slug=organizer.slug,
        links=organizer.links,
        clubs_count=clubs_count,
        created_at=organizer.created_at,
        updated_at=organizer.updated_at,
    )


async def _get_organizer(session: AsyncSession, organizer_id: UUID) -> Organizer:
    organizer = await session.get(Organizer, organizer_id)
    if organizer is None:
        raise NotFoundError("Organizer not found")
    return organizer


async def _clubs_count(session: AsyncSession, organizer_ids: list[UUID]) -> dict[UUID, int]:
    if not organizer_ids:
        return {}
    rows = await session.execute(
        select(Club.organizer_id, func.count())
        .where(Club.organizer_id.in_(organizer_ids))
        .group_by(Club.organizer_id)
    )
    return {
        organizer_id: int(count)
        for organizer_id, count in rows.tuples()
        if organizer_id is not None
    }


async def _assert_slug_unique(
    session: AsyncSession, slug: str, *, exclude_id: UUID | None = None
) -> None:
    statement = select(Organizer.id).where(Organizer.slug == slug)
    if exclude_id is not None:
        statement = statement.where(Organizer.id != exclude_id)
    if await session.scalar(statement) is not None:
        raise ConflictError(f"Organizer slug '{slug}' already exists")


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
            base.order_by(Organizer.name.asc()).limit(pagination.limit).offset(pagination.offset)
        )
    )
    counts = await _clubs_count(session, [item.id for item in rows])
    return PaginatedResponse(
        items=[_organizer_read(item, clubs_count=counts.get(item.id, 0)) for item in rows],
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def get_organizer(session: AsyncSession, organizer_id: UUID) -> OrganizerRead:
    organizer = await _get_organizer(session, organizer_id)
    counts = await _clubs_count(session, [organizer.id])
    return _organizer_read(organizer, clubs_count=counts.get(organizer.id, 0))


async def create_organizer(session: AsyncSession, data: OrganizerCreate) -> OrganizerRead:
    await _assert_slug_unique(session, data.slug)
    organizer = Organizer(name=data.name, slug=data.slug, links=data.links)
    session.add(organizer)
    await session.flush()
    await session.refresh(organizer)
    return _organizer_read(organizer)


async def update_organizer(
    session: AsyncSession, organizer_id: UUID, data: OrganizerUpdate
) -> OrganizerRead:
    organizer = await _get_organizer(session, organizer_id)
    payload = data.model_dump(exclude_unset=True)
    if "slug" in payload:
        await _assert_slug_unique(session, payload["slug"], exclude_id=organizer.id)
    for field, value in payload.items():
        if value is not None:
            setattr(organizer, field, value)
    await session.flush()
    await session.refresh(organizer)
    counts = await _clubs_count(session, [organizer.id])
    return _organizer_read(organizer, clubs_count=counts.get(organizer.id, 0))


async def delete_organizer(session: AsyncSession, organizer_id: UUID) -> None:
    organizer = await _get_organizer(session, organizer_id)
    counts = await _clubs_count(session, [organizer.id])
    if counts.get(organizer.id):
        raise ConflictError(f"Нельзя удалить: в союзе {counts[organizer.id]} клубов")
    await session.delete(organizer)
    await session.flush()
