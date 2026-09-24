"""Записи в ленте: менеджер пишет анонс, вешает афишу и закрепляет наверху."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.feed import FeedPostAdminRead, FeedPostCreate, FeedPostUpdate
from app.services import feed as feed_service

router = APIRouter()

Db = Annotated[AsyncSession, Depends(get_db)]
Manager = Annotated[User, Depends(get_current_user)]


@router.get("/posts", response_model=list[FeedPostAdminRead])
async def list_posts(db: Db) -> list[FeedPostAdminRead]:
    return await feed_service.list_admin_posts(db)


@router.post("/posts", response_model=FeedPostAdminRead, status_code=201)
async def create_post(body: FeedPostCreate, actor: Manager, db: Db) -> FeedPostAdminRead:
    return await feed_service.create_post(db, actor, body)


@router.put("/posts/{post_id}", response_model=FeedPostAdminRead)
async def update_post(post_id: UUID, body: FeedPostUpdate, db: Db) -> FeedPostAdminRead:
    return await feed_service.update_post(db, post_id, body)


@router.post("/posts/{post_id}/image", response_model=FeedPostAdminRead)
async def upload_image(
    post_id: UUID,
    actor: Manager,
    db: Db,
    file: Annotated[UploadFile, File()],
) -> FeedPostAdminRead:
    return await feed_service.set_post_image(
        db, actor, post_id, data=await file.read(), content_type=file.content_type
    )


@router.delete("/posts/{post_id}/image", response_model=FeedPostAdminRead)
async def delete_image(post_id: UUID, db: Db) -> FeedPostAdminRead:
    return await feed_service.clear_post_image(db, post_id)


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: UUID, db: Db) -> Response:
    await feed_service.delete_post(db, post_id)
    return Response(status_code=204)
