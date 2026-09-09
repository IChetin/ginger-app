from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.models.auth import User
from app.schemas.live import (
    LiveCandidateRead,
    LiveEventsBatchCreate,
    LiveEventUpdate,
    LiveSessionCreate,
    LiveSessionFinish,
    LiveSessionRead,
)
from app.services import live as live_service

router = APIRouter(tags=["live"])


@router.post(
    "/live-sessions",
    response_model=LiveSessionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_live_session(
    body: LiveSessionCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
) -> LiveSessionRead:
    row, created = await live_service.create_session(db, user, body)
    if not created:
        response.status_code = status.HTTP_200_OK
    return live_service.to_session_read(row)


@router.get("/live-sessions/active", response_model=LiveSessionRead)
async def get_active_live_session(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LiveSessionRead:
    row = await live_service.get_active_session(db, user)
    if row is None:
        raise NotFoundError("No active live session")
    return live_service.to_session_read(row)


@router.get("/live-sessions/candidates", response_model=list[LiveCandidateRead])
async def list_live_candidates(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    event_id: Annotated[UUID | None, Query()] = None,
    flight_id: Annotated[UUID | None, Query()] = None,
) -> list[LiveCandidateRead]:
    return await live_service.list_candidates(
        db,
        user,
        include_event_id=event_id,
        include_flight_id=flight_id,
    )


@router.post("/live-sessions/{session_id}/events", response_model=LiveSessionRead)
async def add_live_events(
    session_id: UUID,
    body: LiveEventsBatchCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LiveSessionRead:
    row = await live_service.add_events_batch(db, user, session_id, body.events)
    return live_service.to_session_read(row)


@router.patch("/live-events/{event_id}", response_model=LiveSessionRead)
async def patch_live_event(
    event_id: UUID,
    body: LiveEventUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LiveSessionRead:
    row = await live_service.update_event(db, user, event_id, body)
    return live_service.to_session_read(row)


@router.delete("/live-events/{event_id}", response_model=LiveSessionRead)
async def delete_live_event(
    event_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LiveSessionRead:
    row = await live_service.delete_event(db, user, event_id)
    return live_service.to_session_read(row)


@router.post("/live-sessions/{session_id}/finish", response_model=LiveSessionRead)
async def finish_live_session(
    session_id: UUID,
    body: LiveSessionFinish,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LiveSessionRead:
    row = await live_service.finish_session(db, user, session_id, body)
    return live_service.to_session_read(row)


@router.post("/live-sessions/{session_id}/cancel", response_model=LiveSessionRead)
async def cancel_live_session(
    session_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LiveSessionRead:
    row = await live_service.cancel_session(db, user, session_id)
    return live_service.to_session_read(row)
