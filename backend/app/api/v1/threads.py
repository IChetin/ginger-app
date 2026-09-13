"""Диалоги глазами игрока: вопросы менеджеру, разборы раздач, переписка по заявкам (ТЗ §6)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.auth import User
from app.schemas.threads import ThreadCreate, ThreadMessageCreate, ThreadRead, ThreadSummary
from app.services import threads as threads_service

router = APIRouter(tags=["threads"])

CurrentUser = Annotated[User, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me/threads", response_model=list[ThreadSummary])
async def list_threads(
    user: CurrentUser, db: Db, chip_request_id: UUID | None = None
) -> list[ThreadSummary]:
    return await threads_service.list_player_threads(db, user, chip_request_id=chip_request_id)


@router.post("/me/threads", response_model=ThreadRead, status_code=status.HTTP_201_CREATED)
async def create_thread(body: ThreadCreate, user: CurrentUser, db: Db) -> ThreadRead:
    """Новый вопрос. Для заявки на фишки второй вызов дописывает в ту же переписку."""
    return await threads_service.create_thread(db, user, body)


@router.get("/me/threads/{thread_id}", response_model=ThreadRead)
async def get_thread(thread_id: UUID, user: CurrentUser, db: Db) -> ThreadRead:
    return await threads_service.get_player_thread(db, user, thread_id)


@router.post("/me/threads/{thread_id}/messages", response_model=ThreadRead)
async def post_message(
    thread_id: UUID, body: ThreadMessageCreate, user: CurrentUser, db: Db
) -> ThreadRead:
    return await threads_service.post_player_message(db, user, thread_id, body=body.body)


@router.post("/me/threads/{thread_id}/images", response_model=ThreadRead)
async def post_image(
    thread_id: UUID,
    user: CurrentUser,
    db: Db,
    file: Annotated[UploadFile, File()],
    body: Annotated[str | None, Form(max_length=20_000)] = None,
) -> ThreadRead:
    return await threads_service.post_player_message(
        db, user, thread_id, body=body, image=(await file.read(), file.content_type)
    )


@router.get("/me/threads/{thread_id}/attachments/{attachment_id}")
async def get_attachment(
    thread_id: UUID, attachment_id: UUID, user: CurrentUser, db: Db
) -> Response:
    data, content_type = await threads_service.player_attachment(db, user, thread_id, attachment_id)
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private"})
