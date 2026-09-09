"""Массовая загрузка серий из Excel-шаблона.

Роутер подключается до `imports`, иначе `/import/bulk` перехватит `/import/{job_id}`.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import AppError
from app.models.auth import User
from app.schemas.bulk_import import (
    BulkJobRead,
    BulkPreviewResponse,
    BulkPublishResponse,
)
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.admin_headers import parse_notify_header
from app.services.imports.bulk import jobs as bulk_jobs_service
from app.services.imports.bulk import publish as bulk_publish_service

router = APIRouter(tags=["admin-import-bulk"])


@router.get("/import/bulk", response_model=PaginatedResponse[BulkJobRead])
async def list_bulk_imports(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedResponse[BulkJobRead]:
    return await bulk_jobs_service.list_bulk_jobs(
        db,
        PaginationParams(limit=limit, offset=offset),
    )


@router.post(
    "/import/bulk",
    response_model=BulkJobRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_bulk_import(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
) -> BulkJobRead:
    raw = await file.read()
    job = await bulk_jobs_service.create_bulk_job(
        db,
        actor_id=user.id,
        filename=file.filename or "upload.xlsx",
        content_type=file.content_type,
        data=raw,
    )
    return bulk_jobs_service.to_bulk_job_read(job)


@router.get("/import/bulk/{job_id}", response_model=BulkJobRead)
async def get_bulk_import(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BulkJobRead:
    job = await bulk_jobs_service.get_bulk_job(db, job_id)
    return bulk_jobs_service.to_bulk_job_read(job)


@router.post("/import/bulk/{job_id}/preview", response_model=BulkPreviewResponse)
async def preview_bulk_import(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mark_missing_cancelled: Annotated[bool, Query()] = False,
) -> BulkPreviewResponse:
    return await bulk_publish_service.preview_bulk_publish(
        db,
        job_id,
        actor_id=user.id,
        mark_missing_cancelled=mark_missing_cancelled,
    )


@router.post("/import/bulk/{job_id}/publish", response_model=BulkPublishResponse)
async def publish_bulk_import(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mark_missing_cancelled: Annotated[bool, Query()] = False,
    x_preview_token: Annotated[str | None, Header(alias="X-Preview-Token")] = None,
    x_notify: Annotated[str | None, Header(alias="X-Notify")] = None,
) -> BulkPublishResponse:
    if not x_preview_token:
        raise AppError("preview_required", "Preview confirmation required", 400)
    return await bulk_publish_service.publish_bulk(
        db,
        job_id,
        actor_id=user.id,
        preview_token=x_preview_token,
        mark_missing_cancelled=mark_missing_cancelled,
        notify=parse_notify_header(x_notify),
    )
