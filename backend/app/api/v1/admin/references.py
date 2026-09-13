from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.auth import User
from app.schemas.admin_references import OrganizerCreate, OrganizerRead, OrganizerUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services import admin_references as references_service

router = APIRouter()


@router.get("/organizers", response_model=PaginatedResponse[OrganizerRead])
async def list_organizers(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query()] = None,
) -> PaginatedResponse[OrganizerRead]:
    return await references_service.list_organizers(
        db, PaginationParams(limit=limit, offset=offset), search=search
    )


@router.post("/organizers", response_model=OrganizerRead, status_code=status.HTTP_201_CREATED)
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
