from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.enums import ImportKind, ImportStatus, SeriesStatus
from app.models.imports import ImportJob
from app.models.references import Organizer, Venue
from app.models.schedule import Series
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.imports import (
    ImportJobRead,
    ImportStatsResponse,
    ScheduleImportDraft,
    StructureImportDraft,
    parse_import_draft,
)
from app.services.imports.detect import detect_file
from app.services.imports.pipeline import apply_draft_update, run_parse_pipeline
from app.utils.timezone import validate_iana_timezone


def to_job_read(job: ImportJob) -> ImportJobRead:
    draft = parse_import_draft(job.draft)
    mismatch: str | None = None
    requested = job.parser_requested
    used = job.parser_used
    if requested and requested not in {"auto", "ai_only"} and used and used != requested:
        mismatch = (
            f"Запрошен «{requested}», фактически сработал «{used}» "
            "(автовыбор / фолбэк)"
        )
    elif requested == "ai_only" and used and used != "ai_only" and job.parse_path:
        from app.models.enums import ParsePath

        if job.parse_path != ParsePath.AI:
            mismatch = f"Запрошен только ИИ, фактически parse_path={job.parse_path.value}"
    elif (
        job.status == ImportStatus.REVIEW
        and job.error
        and job.error.startswith("Привязанный парсер")
    ):
        mismatch = job.error
    return ImportJobRead(
        id=job.id,
        status=job.status,
        import_kind=job.import_kind,
        original_filename=job.original_filename,
        content_type=job.content_type,
        file_size=job.file_size,
        file_sha256=job.file_sha256,
        detected_type=job.detected_type,
        organizer_id=job.organizer_id,
        series_id=job.series_id,
        file_timezone=job.file_timezone,
        parser_requested=job.parser_requested,
        parser_used=job.parser_used,
        parse_path=job.parse_path,
        parser_mismatch_reason=mismatch,
        confidence=job.confidence,
        tokens_input=job.tokens_input,
        tokens_output=job.tokens_output,
        estimated_cost_usd=job.estimated_cost_usd,
        fields_total=job.fields_total,
        fields_corrected=job.fields_corrected,
        draft=draft,
        error=job.error,
        created_at=job.created_at,
        published_at=job.published_at,
    )


async def _resolve_series_for_import(
    session: AsyncSession,
    *,
    series_id: UUID | None,
    create_series: bool,
    organizer_id: UUID | None,
    venue_id: UUID | None,
    series_name: str | None,
    starts_on: date | None,
    ends_on: date | None,
) -> Series:
    if create_series:
        if series_id is not None:
            raise AppError(
                "validation_error",
                "series_id must be empty when create_series is true",
                400,
            )
        if organizer_id is None or venue_id is None:
            raise AppError(
                "validation_error",
                "organizer_id and venue_id are required to create a series",
                400,
            )
        if not series_name or not series_name.strip():
            raise AppError("validation_error", "series_name is required", 400)
        if starts_on is None or ends_on is None:
            raise AppError("validation_error", "starts_on and ends_on are required", 400)
        if starts_on > ends_on:
            raise AppError("validation_error", "starts_on must be <= ends_on", 400)

        organizer = await session.get(Organizer, organizer_id)
        if organizer is None:
            raise NotFoundError("Organizer not found")
        venue = await session.get(Venue, venue_id)
        if venue is None:
            raise NotFoundError("Venue not found")

        from app.services import slugs as slugs_service

        slug = await slugs_service.allocate_series_slug(
            session,
            organizer_slug=organizer.slug,
            city=venue.city,
            starts_on=starts_on,
        )
        series = Series(
            organizer_id=organizer_id,
            venue_id=venue_id,
            name=series_name.strip()[:160],
            slug=slug,
            starts_on=starts_on,
            ends_on=ends_on,
            status=SeriesStatus.ANNOUNCED,
        )
        session.add(series)
        await session.flush()
        loaded = await session.scalar(
            select(Series)
            .where(Series.id == series.id)
            .options(selectinload(Series.events), selectinload(Series.organizer))
        )
        assert loaded is not None
        return loaded

    if series_id is None:
        raise AppError(
            "validation_error",
            "series_id is required unless create_series is true",
            400,
        )
    found = await session.scalar(
        select(Series)
        .where(Series.id == series_id)
        .options(selectinload(Series.events), selectinload(Series.organizer))
    )
    if found is None:
        raise NotFoundError("Series not found")
    return found


async def create_import_job(
    session: AsyncSession,
    *,
    actor_id: UUID,
    filename: str,
    content_type: str | None,
    data: bytes,
    series_id: UUID | None = None,
    create_series: bool = False,
    organizer_id: UUID | None = None,
    venue_id: UUID | None = None,
    series_name: str | None = None,
    starts_on: date | None = None,
    ends_on: date | None = None,
    file_timezone: str | None = None,
    import_kind: ImportKind = ImportKind.SCHEDULE,
    parser_requested: str | None = None,
    settings: Settings | None = None,
) -> ImportJob:
    cfg = settings or get_settings()
    if create_series and import_kind != ImportKind.SCHEDULE:
        raise AppError(
            "validation_error",
            "create_series is only supported for schedule imports",
            400,
        )

    tz_name: str | None = None
    if file_timezone:
        try:
            tz_name = validate_iana_timezone(file_timezone.strip())
        except ValueError as exc:
            raise AppError("validation_error", str(exc), 400) from exc

    series = await _resolve_series_for_import(
        session,
        series_id=series_id,
        create_series=create_series,
        organizer_id=organizer_id,
        venue_id=venue_id,
        series_name=series_name,
        starts_on=starts_on,
        ends_on=ends_on,
    )

    if import_kind == ImportKind.SCHEDULE:
        if series.events:
            raise AppError(
                "conflict",
                "Schedule import is allowed only into a series without events",
                409,
            )
    elif not series.events:
        raise AppError(
            "conflict",
            "Structure import requires a series with existing events",
            409,
        )

    detected = detect_file(
        data,
        filename=filename,
        declared_content_type=content_type,
        max_bytes=cfg.import_max_file_bytes,
    )

    requested = (parser_requested or "auto").strip() or "auto"
    _validate_parser_request(
        requested=requested,
        detected_type=detected.detected_type,
        import_kind=import_kind,
    )

    job = ImportJob(
        uploaded_by=actor_id,
        original_filename=filename[:255],
        content_type=detected.content_type,
        file_size=detected.size,
        file_sha256=detected.sha256,
        file_data=data,
        detected_type=detected.detected_type,
        import_kind=import_kind,
        organizer_id=series.organizer_id,
        series_id=series.id,
        file_timezone=tz_name,
        parser_requested=requested if requested != "auto" else None,
        status=ImportStatus.UPLOADED,
    )
    session.add(job)
    await session.flush()
    return await run_parse_pipeline(session, job, settings=cfg)


def _validate_parser_request(
    *,
    requested: str,
    detected_type: str,
    import_kind: ImportKind,
) -> None:
    from app.services.imports.parsers import register_builtin_parsers
    from app.services.imports.registry import (
        find_parser_by_name,
        find_structure_parser_by_name,
    )

    if requested in {"auto", "ai_only"}:
        if requested == "ai_only" and import_kind == ImportKind.STRUCTURES:
            raise AppError(
                "validation_error",
                "Только ИИ недоступен для импорта структур",
                400,
            )
        return

    register_builtin_parsers()
    if import_kind == ImportKind.STRUCTURES:
        parser = find_structure_parser_by_name(requested)
    else:
        parser = find_parser_by_name(requested)
    if parser is None:
        raise AppError(
            "validation_error",
            f"Неизвестный парсер: {requested}",
            400,
        )
    supported = getattr(parser, "supported_types", frozenset())
    if supported and detected_type not in supported:
        types = ", ".join(sorted(supported))
        raise AppError(
            "validation_error",
            (
                f"Парсер {requested} не подходит для файла типа «{detected_type}» "
                f"(поддерживает: {types})"
            ),
            400,
        )


async def list_import_jobs(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    status: ImportStatus | None = None,
    import_kind: ImportKind | None = None,
) -> PaginatedResponse[ImportJobRead]:
    base = select(ImportJob)
    if status is not None:
        base = base.where(ImportJob.status == status)
    if import_kind is not None:
        base = base.where(ImportJob.import_kind == import_kind)
    else:
        # Массовая загрузка не привязана к серии и разбирается на своём экране.
        base = base.where(ImportJob.import_kind != ImportKind.BULK_XLSX)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.scalars(
        base.order_by(ImportJob.created_at.desc(), ImportJob.id.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    return PaginatedResponse(
        items=[to_job_read(job) for job in rows],
        total=total or 0,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def get_import_job(session: AsyncSession, job_id: UUID) -> ImportJob:
    job = await session.get(ImportJob, job_id)
    if job is None:
        raise NotFoundError("Import job not found")
    return job


async def update_import_draft(
    session: AsyncSession,
    job_id: UUID,
    draft: ScheduleImportDraft | StructureImportDraft,
) -> ImportJob:
    job = await get_import_job(session, job_id)
    return await apply_draft_update(session, job, draft)


async def cancel_import_job(session: AsyncSession, job_id: UUID) -> ImportJob:
    """Abandon a review job so it no longer counts toward the nav badge."""
    job = await get_import_job(session, job_id)
    if job.status != ImportStatus.REVIEW:
        raise AppError(
            "conflict",
            f"Only review jobs can be cancelled (status={job.status.value})",
            409,
        )
    job.status = ImportStatus.FAILED
    job.error = "cancelled_by_editor"
    await session.flush()
    return job


async def import_stats(session: AsyncSession) -> ImportStatsResponse:
    rows = list(await session.scalars(select(ImportJob)))
    by_status: dict[str, int] = {}
    by_path: dict[str, int] = {}
    by_parser: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    confidences: list[Decimal] = []
    tokens_in = 0
    tokens_out = 0
    cost = Decimal("0")
    corrections: list[Decimal] = []
    published = 0

    for job in rows:
        by_status[job.status.value] = by_status.get(job.status.value, 0) + 1
        by_kind[job.import_kind.value] = by_kind.get(job.import_kind.value, 0) + 1
        if job.parse_path is not None:
            by_path[job.parse_path.value] = by_path.get(job.parse_path.value, 0) + 1
        if job.parser_used:
            by_parser[job.parser_used] = by_parser.get(job.parser_used, 0) + 1
        if job.confidence is not None:
            confidences.append(job.confidence)
        tokens_in += job.tokens_input or 0
        tokens_out += job.tokens_output or 0
        cost += job.estimated_cost_usd or Decimal("0")
        if job.status == ImportStatus.PUBLISHED:
            published += 1
        if job.fields_total and job.fields_total > 0 and job.fields_corrected is not None:
            corrections.append(Decimal(job.fields_corrected) / Decimal(job.fields_total))

    total = len(rows)
    success_rate = (
        (Decimal(published) / Decimal(total)).quantize(Decimal("0.0001")) if total else None
    )
    avg_confidence = (
        (sum(confidences, Decimal("0")) / Decimal(len(confidences))).quantize(Decimal("0.01"))
        if confidences
        else None
    )
    avg_correction = (
        (sum(corrections, Decimal("0")) / Decimal(len(corrections))).quantize(Decimal("0.0001"))
        if corrections
        else None
    )
    return ImportStatsResponse(
        total=total,
        by_status=by_status,
        by_parse_path=by_path,
        by_parser=by_parser,
        by_kind=by_kind,
        success_rate=success_rate,
        avg_confidence=avg_confidence,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        estimated_cost_usd=cost.quantize(Decimal("0.000001")),
        avg_correction_ratio=avg_correction,
    )
