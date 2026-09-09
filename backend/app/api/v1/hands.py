from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models.auth import User
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.hands import (
    HandCreate,
    HandDraftCreate,
    HandEventBrief,
    HandLinkTarget,
    HandListItem,
    HandListStatusFilter,
    HandPatch,
    HandPublish,
    HandRead,
)
from app.services import hands as hands_service
from app.services.pdf import hand_og as hand_og_service

router = APIRouter(prefix="/hands", tags=["hands"])


@router.post("", response_model=HandRead, status_code=status.HTTP_201_CREATED)
async def create_hand(
    body: HandCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HandRead:
    row = await hands_service.create_hand(db, user, body)
    return hands_service.to_read(row, user)


@router.post("/draft", response_model=HandRead)
async def create_draft(
    body: HandDraftCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
) -> HandRead:
    row, created = await hands_service.create_draft(db, user, body)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return hands_service.to_read(row, user)


@router.get("", response_model=PaginatedResponse[HandListItem])
async def list_hands(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    event_id: Annotated[UUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=160)] = None,
    status_filter: Annotated[HandListStatusFilter, Query(alias="status")] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedResponse[HandListItem]:
    return await hands_service.list_hands(
        db,
        user,
        PaginationParams(limit=limit, offset=offset),
        event_id=event_id,
        q=q,
        status=status_filter,
    )


@router.get("/opponent-names", response_model=list[str])
async def list_opponent_names(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[str]:
    return await hands_service.list_opponent_names(db, user)


@router.get("/events", response_model=list[HandEventBrief])
async def list_hand_events(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[HandEventBrief]:
    return await hands_service.list_hand_events(db, user)


@router.get("/link-targets", response_model=list[HandLinkTarget])
async def list_link_targets(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[str | None, Query(max_length=160)] = None,
) -> list[HandLinkTarget]:
    return await hands_service.list_link_targets(db, user, q=q)


@router.post("/{hand_id}/publish", response_model=HandRead)
async def publish_draft(
    hand_id: UUID,
    body: HandPublish,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HandRead:
    row = await hands_service.publish_draft(db, user, hand_id, body)
    return hands_service.to_read(row, user)


@router.get("/{slug}/og.png")
async def get_hand_og(
    slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
) -> Response:
    png_bytes, cache_hit = await hand_og_service.get_hand_og_png(db, slug, viewer)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=300",
            "X-Share-Cache": "HIT" if cache_hit else "MISS",
        },
    )


@router.get("/{slug}", response_model=HandRead)
async def get_hand(
    slug: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
) -> HandRead:
    increment = not hands_service.is_crawler_ua(request.headers.get("user-agent"))
    row = await hands_service.get_hand(db, slug, viewer, increment_views=increment)
    return hands_service.to_read(row, viewer)


@router.patch("/{ref}", response_model=HandRead)
async def patch_hand(
    ref: str,
    body: HandPatch,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HandRead:
    row = await hands_service.patch_hand(db, user, ref, body)
    return hands_service.to_read(row, user)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hand(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await hands_service.delete_hand(db, user, slug)
