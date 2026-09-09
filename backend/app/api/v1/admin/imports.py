from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.enums import ImportKind, ImportStatus
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.imports import (
    ImportDraftUpdate,
    ImportJobRead,
    ImportPublishPreviewResponse,
    ImportPublishResponse,
    ImportStatsResponse,
)
from app.services.imports import jobs as jobs_service
from app.services.imports import publish as publish_service

router = APIRouter(tags=["admin-import"])


def _parse_bool_form(value: str | bool | None) -> bool:
    if value is None or value is False:
        return False
    if value is True:
        return True
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


@router.get("/import/stats", response_model=ImportStatsResponse)
async def get_import_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportStatsResponse:
    return await jobs_service.import_stats(db)


@router.get("/import", response_model=PaginatedResponse[ImportJobRead])
async def list_imports(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    status_filter: Annotated[ImportStatus | None, Query(alias="status")] = None,
    kind_filter: Annotated[ImportKind | None, Query(alias="import_kind")] = None,
) -> PaginatedResponse[ImportJobRead]:
    return await jobs_service.list_import_jobs(
        db,
        PaginationParams(limit=limit, offset=offset),
        status=status_filter,
        import_kind=kind_filter,
    )


@router.post(
    "/import",
    response_model=ImportJobRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_import(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
    series_id: Annotated[UUID | None, Form()] = None,
    create_series: Annotated[str | None, Form()] = None,
    organizer_id: Annotated[UUID | None, Form()] = None,
    venue_id: Annotated[UUID | None, Form()] = None,
    series_name: Annotated[str | None, Form()] = None,
    starts_on: Annotated[date | None, Form()] = None,
    ends_on: Annotated[date | None, Form()] = None,
    file_timezone: Annotated[str | None, Form()] = None,
    import_kind: Annotated[ImportKind, Form()] = ImportKind.SCHEDULE,
    parser_requested: Annotated[str | None, Form()] = None,
) -> ImportJobRead:
    raw = await file.read()
    filename = file.filename or "upload.bin"
    job = await jobs_service.create_import_job(
        db,
        actor_id=user.id,
        series_id=series_id,
        create_series=_parse_bool_form(create_series),
        organizer_id=organizer_id,
        venue_id=venue_id,
        series_name=series_name,
        starts_on=starts_on,
        ends_on=ends_on,
        file_timezone=file_timezone,
        filename=filename,
        content_type=file.content_type,
        data=raw,
        import_kind=import_kind,
        parser_requested=parser_requested,
    )
    return jobs_service.to_job_read(job)


@router.get("/import/{job_id}", response_model=ImportJobRead)
async def get_import(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportJobRead:
    job = await jobs_service.get_import_job(db, job_id)
    return jobs_service.to_job_read(job)


@router.put("/import/{job_id}/draft", response_model=ImportJobRead)
async def update_draft(
    job_id: UUID,
    body: ImportDraftUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportJobRead:
    job = await jobs_service.update_import_draft(db, job_id, body.draft)
    return jobs_service.to_job_read(job)


@router.post("/import/{job_id}/cancel", response_model=ImportJobRead)
async def cancel_import(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportJobRead:
    job = await jobs_service.cancel_import_job(db, job_id)
    return jobs_service.to_job_read(job)


@router.post(
    "/import/{job_id}/publish/preview",
    response_model=ImportPublishPreviewResponse,
)
async def preview_publish(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ImportPublishPreviewResponse:
    return await publish_service.preview_publish(db, job_id, actor_id=user.id)


@router.post("/import/{job_id}/publish", response_model=ImportPublishResponse)
async def publish(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    x_preview_token: Annotated[str | None, Header(alias="X-Preview-Token")] = None,
) -> ImportPublishResponse:
    if not x_preview_token:
        raise AppError("preview_required", "Preview confirmation required", 400)
    return await publish_service.publish_import(
        db,
        job_id,
        actor_id=user.id,
        preview_token=x_preview_token,
    )
