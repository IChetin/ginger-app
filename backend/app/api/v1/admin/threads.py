"""Инбокс менеджера: все диалоги игроков, ответы, закрытие (ТЗ §6, экраны §3.9)."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.threads import ThreadMessageCreate, ThreadRead, ThreadSummary
from app.services import threads as threads_service

router = APIRouter()

Db = Annotated[AsyncSession, Depends(get_db)]
Manager = Annotated[User, Depends(get_current_user)]


@router.get("/threads", response_model=list[ThreadSummary])
async def list_threads(
    db: Db, scope: Annotated[Literal["open", "all"], Query()] = "open"
) -> list[ThreadSummary]:
    return await threads_service.list_admin_threads(db, scope=scope)


@router.get("/threads/{thread_id}", response_model=ThreadRead)
async def get_thread(thread_id: UUID, db: Db) -> ThreadRead:
    return await threads_service.get_admin_thread(db, thread_id)


@router.post("/threads/{thread_id}/messages", response_model=ThreadRead)
async def post_message(
    thread_id: UUID, body: ThreadMessageCreate, actor: Manager, db: Db
) -> ThreadRead:
    return await threads_service.post_manager_message(db, actor, thread_id, body=body.body)


@router.post("/threads/{thread_id}/images", response_model=ThreadRead)
async def post_image(
    thread_id: UUID,
    actor: Manager,
    db: Db,
    file: Annotated[UploadFile, File()],
    body: Annotated[str | None, Form(max_length=20_000)] = None,
) -> ThreadRead:
    return await threads_service.post_manager_message(
        db, actor, thread_id, body=body, image=(await file.read(), file.content_type)
    )


@router.post("/threads/{thread_id}/close", response_model=ThreadRead)
async def close_thread(thread_id: UUID, db: Db) -> ThreadRead:
    return await threads_service.close_thread(db, thread_id)


@router.get("/threads/{thread_id}/attachments/{attachment_id}")
async def get_attachment(thread_id: UUID, attachment_id: UUID, db: Db) -> Response:
    data, content_type = await threads_service.manager_attachment(db, thread_id, attachment_id)
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private"})
