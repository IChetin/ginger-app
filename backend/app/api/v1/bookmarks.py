from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.bookmarks import (
    BookmarkCreate,
    BookmarkMigrateBody,
    BookmarkMigrateResponse,
    BookmarkOverviewItem,
    BookmarkRead,
    BookmarkTargetResolveBody,
    BookmarkTargetResolveResponse,
    BookmarkUpdate,
)
from app.services import bookmarks as bookmarks_service

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.get("", response_model=list[BookmarkRead])
async def list_bookmarks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BookmarkRead]:
    items = await bookmarks_service.list_bookmarks(db, user)
    return [BookmarkRead.model_validate(item) for item in items]


@router.get("/overview", response_model=list[BookmarkOverviewItem])
async def list_bookmarks_overview(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BookmarkOverviewItem]:
    return await bookmarks_service.list_bookmarks_overview(db, user)


@router.post("/resolve-targets", response_model=BookmarkTargetResolveResponse)
async def resolve_bookmark_targets(
    body: BookmarkTargetResolveBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookmarkTargetResolveResponse:
    """Public batch hydrate for guest IndexedDB bookmark targets."""
    items = await bookmarks_service.resolve_bookmark_targets(db, body.items)
    return BookmarkTargetResolveResponse(items=items)


@router.post("", response_model=BookmarkRead, status_code=status.HTTP_201_CREATED)
async def create_bookmark(
    body: BookmarkCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookmarkRead:
    bookmark = await bookmarks_service.create_bookmark(db, user, body)
    return BookmarkRead.model_validate(bookmark)


@router.post("/migrate", response_model=BookmarkMigrateResponse)
async def migrate_bookmarks(
    body: BookmarkMigrateBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookmarkMigrateResponse:
    return await bookmarks_service.migrate_bookmarks(db, user, body.items)


@router.patch("/{bookmark_id}", response_model=BookmarkRead)
async def update_bookmark(
    bookmark_id: UUID,
    body: BookmarkUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookmarkRead:
    bookmark = await bookmarks_service.update_bookmark(db, user, bookmark_id, body)
    return BookmarkRead.model_validate(bookmark)


@router.delete("/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(
    bookmark_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await bookmarks_service.delete_bookmark(db, user, bookmark_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
