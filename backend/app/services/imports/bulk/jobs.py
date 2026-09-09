"""Создание задания массовой загрузки: файл → черновик в `import_jobs`."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.enums import ImportKind, ImportStatus
from app.models.imports import ImportJob
from app.schemas.bulk_import import BulkImportDraft, BulkJobRead
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.imports.bulk.assemble import assemble_draft
from app.services.imports.bulk.reader import SheetFormatError, read_sheet
from app.services.imports.bulk.references import resolve_references
from app.services.imports.bulk.validate import validate_draft
from app.services.imports.detect import detect_file


def to_bulk_job_read(job: ImportJob) -> BulkJobRead:
    draft = BulkImportDraft.model_validate(job.draft) if job.draft else None
    return BulkJobRead(
        id=job.id,
        status=job.status,
        original_filename=job.original_filename,
        file_size=job.file_size,
        file_sha256=job.file_sha256,
        draft=draft,
        error=job.error,
        created_at=job.created_at,
        published_at=job.published_at,
    )


async def create_bulk_job(
    session: AsyncSession,
    *,
    actor_id: UUID,
    filename: str,
    content_type: str | None,
    data: bytes,
    settings: Settings | None = None,
) -> ImportJob:
    cfg = settings or get_settings()
    detected = detect_file(
        data,
        filename=filename,
        declared_content_type=content_type,
        max_bytes=cfg.import_max_file_bytes,
    )
    if detected.detected_type != "xlsx":
        raise AppError(
            "validation_error",
            "Массовая загрузка принимает только XLSX — скачайте шаблон Day2.",
            400,
        )

    job = ImportJob(
        uploaded_by=actor_id,
        original_filename=filename[:255],
        content_type=detected.content_type,
        file_size=detected.size,
        file_sha256=detected.sha256,
        file_data=data,
        detected_type=detected.detected_type,
        import_kind=ImportKind.BULK_XLSX,
        status=ImportStatus.PARSING,
    )
    session.add(job)
    await session.flush()

    try:
        draft = assemble_draft(read_sheet(data))
    except SheetFormatError as exc:
        job.status = ImportStatus.FAILED
        job.error = exc.message
        await session.flush()
        raise AppError("validation_error", exc.message, 400) from exc

    resolution = await resolve_references(session, draft.series)
    draft = await validate_draft(session, draft, resolution)

    job.draft = draft.model_dump(mode="json")
    job.initial_draft = job.draft
    job.status = ImportStatus.REVIEW
    job.error = None
    await session.flush()
    return job


async def get_bulk_job(session: AsyncSession, job_id: UUID) -> ImportJob:
    job = await session.get(ImportJob, job_id)
    if job is None or job.import_kind != ImportKind.BULK_XLSX:
        raise NotFoundError("Import job not found")
    return job


async def list_bulk_jobs(
    session: AsyncSession,
    pagination: PaginationParams,
) -> PaginatedResponse[BulkJobRead]:
    base = select(ImportJob).where(ImportJob.import_kind == ImportKind.BULK_XLSX)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.scalars(
        base.order_by(ImportJob.created_at.desc(), ImportJob.id.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    return PaginatedResponse(
        items=[to_bulk_job_read(job) for job in rows],
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )
