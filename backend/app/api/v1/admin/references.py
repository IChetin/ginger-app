from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.auth import User
from app.schemas.admin_references import (
    OrganizerCreate,
    OrganizerRead,
    OrganizerUpdate,
    ParserInfo,
    ParserProfileUpdate,
    VenueCreate,
    VenueRead,
    VenueUpdate,
)
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services import admin_references as references_service

router = APIRouter()


@router.get("/venues", response_model=PaginatedResponse[VenueRead])
async def list_venues(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query()] = None,
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
) -> PaginatedResponse[VenueRead]:
    return await references_service.list_venues(
        db,
        PaginationParams(limit=limit, offset=offset),
        search=search,
        country_code=country_code,
    )


@router.post("/venues", response_model=VenueRead, status_code=status.HTTP_201_CREATED)
async def create_venue(
    body: VenueCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> VenueRead:
    return await references_service.create_venue(db, body)


@router.get("/venues/{venue_id}", response_model=VenueRead)
async def get_venue(
    venue_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VenueRead:
    return await references_service.get_venue(db, venue_id)


@router.patch("/venues/{venue_id}", response_model=VenueRead)
async def update_venue(
    venue_id: UUID,
    body: VenueUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> VenueRead:
    return await references_service.update_venue(db, venue_id, body)


@router.delete("/venues/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_venue(
    venue_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> Response:
    await references_service.delete_venue(db, venue_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/organizers", response_model=PaginatedResponse[OrganizerRead])
async def list_organizers(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query()] = None,
) -> PaginatedResponse[OrganizerRead]:
    return await references_service.list_organizers(
        db,
        PaginationParams(limit=limit, offset=offset),
        search=search,
    )


@router.post(
    "/organizers",
    response_model=OrganizerRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_organizer(
    body: OrganizerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> OrganizerRead:
    return await references_service.create_organizer(db, body)


@router.get("/organizers/{organizer_id}", response_model=OrganizerRead)
async def get_organizer(
    organizer_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizerRead:
    return await references_service.get_organizer(db, organizer_id)


@router.patch("/organizers/{organizer_id}", response_model=OrganizerRead)
async def update_organizer(
    organizer_id: UUID,
    body: OrganizerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> OrganizerRead:
    return await references_service.update_organizer(db, organizer_id, body)


@router.delete("/organizers/{organizer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organizer(
    organizer_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> Response:
    await references_service.delete_organizer(db, organizer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/organizers/{organizer_id}/logo", response_model=OrganizerRead)
async def upload_organizer_logo(
    organizer_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    file: Annotated[UploadFile, File()],
) -> OrganizerRead:
    data = await file.read()
    return await references_service.upload_organizer_logo(
        db,
        organizer_id,
        data=data,
        content_type=file.content_type,
    )


@router.delete("/organizers/{organizer_id}/logo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organizer_logo(
    organizer_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> Response:
    await references_service.delete_organizer_logo(db, organizer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/parsers", response_model=list[ParserInfo])
async def list_parsers(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ParserInfo]:
    return await references_service.list_parser_info(db)


@router.get("/parsers/{parser_id}", response_model=ParserInfo)
async def get_parser(
    parser_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ParserInfo:
    from app.services import admin_parsers as parsers_service

    return await parsers_service.get_parser_profile(db, parser_id)


@router.patch("/parsers/{parser_id}", response_model=ParserInfo)
async def update_parser(
    parser_id: UUID,
    body: ParserProfileUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> ParserInfo:
    from app.services import admin_parsers as parsers_service

    return await parsers_service.update_parser_profile(db, parser_id, body)
