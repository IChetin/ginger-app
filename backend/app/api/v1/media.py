from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import admin_references as references_service

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/organizers/{organizer_id}/logo")
async def get_organizer_logo(
    organizer_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    data, content_type = await references_service.get_organizer_logo_bytes(db, organizer_id)
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )
