from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.models.enums import ImportKind, ImportStatus, ParsePath
from app.models.imports import ImportJob
from app.models.references import Organizer
from app.models.schedule import Series
from app.schemas.imports import (
    ParseResult,
    ScheduleImportDraft,
    StructureImportDraft,
    draft_from_parse_result,
    draft_from_structure_result,
    draft_to_dict,
    parse_import_draft,
)
from app.services.imports.ai import get_ai_provider
from app.services.imports.base import ParserContext
from app.services.imports.enrich import annotate_events, enrich_field_confidence
from app.services.imports.matching import suggest_structure_matches
from app.services.imports.registry import (
    find_parser,
    find_parser_by_name,
    find_structure_parser,
    find_structure_parser_by_name,
)
from app.services.imports.validation import (
    draft_has_errors,
    validate_draft,
    validate_structure_draft,
)


async def _load_series(session: AsyncSession, series_id: UUID) -> Series:
    series = await session.scalar(
        select(Series)
        .where(Series.id == series_id)
        .options(
            selectinload(Series.organizer).selectinload(Organizer.schedule_parser),
            selectinload(Series.organizer).selectinload(Organizer.structure_parser),
            selectinload(Series.venue),
            selectinload(Series.events),
        )
    )
    if series is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Series not found")
    return series


def _parser_context(
    job: ImportJob,
    series: Series,
    *,
    skip_organizer_slug_check: bool = False,
) -> ParserContext:
    default_currency = "RUB"
    country = series.venue.country_code if series.venue else None
    if country == "BY":
        default_currency = "BYN"
    elif country == "CY":
        default_currency = "EUR"
    return ParserContext(
        filename=job.original_filename,
        detected_type=job.detected_type,
        organizer_slug=series.organizer.slug if series.organizer else None,
        series_id=str(series.id),
        series_starts_on=series.starts_on,
        series_ends_on=series.ends_on,
        venue_timezone=series.venue.timezone if series.venue else None,
        default_currency_code=default_currency,
        import_kind=job.import_kind.value,
        skip_organizer_slug_check=skip_organizer_slug_check,
    )


def _bound_parser_code(series: Series, *, kind: str) -> str | None:
    organizer = series.organizer
    if organizer is None:
        return None
    if kind == "structures":
        profile = organizer.structure_parser
    else:
        profile = organizer.schedule_parser
    if profile is None or not profile.is_active or not profile.is_available:
        return None
    if profile.kind != kind:
        return None
    return profile.code


def _select_schedule_parser(
    job: ImportJob,
    series: Series,
    data: bytes,
) -> tuple[object | None, ParserContext, str | None]:
    """Return (parser, ctx, fallback_note).

    Order: explicit request → organizer binding → auto supports().
    Bound/explicit selection skips the organizer_slug gate; if bound parser
    does not support the file, fall back to auto with a note.
    """
    requested = job.parser_requested
    skip_template = requested == "ai_only"
    if skip_template:
        return None, _parser_context(job, series), None

    if requested and requested not in {"auto", "ai_only"}:
        ctx = _parser_context(job, series, skip_organizer_slug_check=True)
        parser = find_parser_by_name(requested)
        return parser, ctx, None

    bound_code = _bound_parser_code(series, kind="schedule")
    if bound_code:
        ctx = _parser_context(job, series, skip_organizer_slug_check=True)
        parser = find_parser_by_name(bound_code)
        if parser is not None and parser.supports(ctx, data):
            return parser, ctx, None
        # Bound parser unsuitable → auto fallback.
        auto_ctx = _parser_context(job, series)
        auto = find_parser(auto_ctx, data)
        note = (
            f"Привязанный парсер «{bound_code}» не подошёл к файлу; "
            f"использован автоподбор"
            + (f" («{auto.name}»)" if auto is not None else " (не найден)")
        )
        return auto, auto_ctx, note

    ctx = _parser_context(job, series)
    return find_parser(ctx, data), ctx, None


def _select_structure_parser(
    job: ImportJob,
    series: Series,
    data: bytes,
) -> tuple[object | None, ParserContext, str | None]:
    requested = job.parser_requested
    if requested and requested not in {"auto", "ai_only"}:
        ctx = _parser_context(job, series, skip_organizer_slug_check=True)
        return find_structure_parser_by_name(requested), ctx, None

    bound_code = _bound_parser_code(series, kind="structures")
    if bound_code:
        ctx = _parser_context(job, series, skip_organizer_slug_check=True)
        parser = find_structure_parser_by_name(bound_code)
        if parser is not None and parser.supports(ctx, data):
            return parser, ctx, None
        auto_ctx = _parser_context(job, series)
        auto = find_structure_parser(auto_ctx, data)
        note = (
            f"Привязанный парсер «{bound_code}» не подошёл к файлу; "
            f"использован автоподбор"
            + (f" («{auto.name}»)" if auto is not None else " (не найден)")
        )
        return auto, auto_ctx, note

    ctx = _parser_context(job, series)
    return find_structure_parser(ctx, data), ctx, None


async def run_parse_pipeline(
    session: AsyncSession,
    job: ImportJob,
    *,
    settings: Settings | None = None,
) -> ImportJob:
    from app.services.imports.parsers import register_builtin_parsers

    register_builtin_parsers()
    cfg = settings or get_settings()
    if job.series_id is None:
        raise AppError("validation_error", "series_id is required", 400)

    series = await _load_series(session, job.series_id)
    job.organizer_id = series.organizer_id
    job.status = ImportStatus.PARSING
    await session.flush()

    if job.import_kind == ImportKind.STRUCTURES:
        return await _run_structure_pipeline(session, job, series, settings=cfg)
    return await _run_schedule_pipeline(session, job, series, settings=cfg)


async def _run_schedule_pipeline(
    session: AsyncSession,
    job: ImportJob,
    series: Series,
    *,
    settings: Settings,
) -> ImportJob:
    data = bytes(job.file_data)
    threshold = Decimal(str(settings.import_confidence_threshold))
    parse_result: ParseResult | None = None
    parse_path = ParsePath.CODE
    parser_used: str | None = None
    fallback_note: str | None = None

    requested = job.parser_requested
    skip_template = requested == "ai_only"
    parser = None
    ctx = _parser_context(job, series)
    if not skip_template:
        parser, ctx, fallback_note = _select_schedule_parser(job, series, data)
        if (
            requested
            and requested not in {"auto", "ai_only"}
            and parser is not None
            and not parser.supports(ctx, data)
        ):
            # Explicit request that fails content check — fail clearly (no silent fallback).
            job.status = ImportStatus.FAILED
            job.error = (
                f"Парсер {requested} не подходит для этого файла "
                f"(формат/содержимое)"
            )
            job.parser_used = None
            await session.flush()
            return job
        if (
            requested
            and requested not in {"auto", "ai_only"}
            and parser is None
        ):
            job.status = ImportStatus.FAILED
            job.error = f"Неизвестный парсер: {requested}"
            await session.flush()
            return job

    if parser is not None:
        try:
            parse_result = parser.parse(ctx, data)
            parser_used = parser.name
        except Exception as exc:  # noqa: BLE001 - fall back to AI
            job.error = f"Parser {parser.name} failed: {type(exc).__name__}: {exc}"
            parse_result = None

    needs_ai = skip_template or (
        parse_result is None
        or parse_result.confidence < threshold
        or bool(parse_result.unparsed_rows)
        or job.detected_type == "image"
    )

    if needs_ai:
        ai = get_ai_provider(settings)
        try:
            ai_result = ai.parse(
                ctx,
                data,
                unparsed_rows=parse_result.unparsed_rows if parse_result else None,
            )
            ai_events = annotate_events(
                ai_result.events,
                parse_path=ParsePath.AI,
                fragments=list(parse_result.unparsed_rows) if parse_result else None,
            )
            if parse_result is None or not parse_result.events:
                parse_result = ai_result.model_copy(update={"events": ai_events})
                parse_path = ParsePath.AI
                parser_used = ai.name
            else:
                code_events = annotate_events(parse_result.events, parse_path=ParsePath.CODE)
                parse_result = ParseResult(
                    events=code_events + ai_events,
                    unparsed_rows=ai_result.unparsed_rows,
                    confidence=min(parse_result.confidence, ai_result.confidence),
                    parser_used=parser_used,
                    parse_path=ParsePath.MIXED,
                    tokens_input=ai_result.tokens_input,
                    tokens_output=ai_result.tokens_output,
                    estimated_cost_usd=ai_result.estimated_cost_usd or Decimal("0"),
                    issues=list(parse_result.issues) + list(ai_result.issues),
                )
                parse_path = ParsePath.MIXED
        except AppError as exc:
            if parse_result is None:
                job.status = ImportStatus.FAILED
                job.error = exc.message
                if fallback_note:
                    job.error = f"{exc.message}. {fallback_note}"
                job.parser_used = parser_used
                await session.flush()
                return job
            parse_path = ParsePath.CODE
            parse_result = parse_result.model_copy(
                update={
                    "events": annotate_events(parse_result.events, parse_path=ParsePath.CODE),
                }
            )
    elif parse_result is not None:
        parse_result = parse_result.model_copy(
            update={
                "events": annotate_events(parse_result.events, parse_path=ParsePath.CODE),
            }
        )

    if parse_result is None:
        job.status = ImportStatus.FAILED
        job.error = job.error or "Unable to parse schedule file"
        if fallback_note and job.error:
            job.error = f"{job.error}. {fallback_note}"
        await session.flush()
        return job

    draft = draft_from_parse_result(parse_result)
    draft = await validate_draft(session, draft, series=series)
    draft = enrich_field_confidence(draft)
    payload = draft_to_dict(draft)

    job.parser_used = parser_used or parse_result.parser_used
    job.parse_path = parse_path
    job.confidence = draft.confidence
    job.tokens_input = parse_result.tokens_input
    job.tokens_output = parse_result.tokens_output
    job.estimated_cost_usd = parse_result.estimated_cost_usd or Decimal("0")
    job.initial_draft = payload
    job.draft = payload
    job.fields_total = None
    job.fields_corrected = None

    if draft_has_errors(draft) and not draft.events:
        job.status = ImportStatus.FAILED
        job.error = "Validation failed"
        if fallback_note:
            job.error = f"Validation failed. {fallback_note}"
    else:
        job.status = ImportStatus.REVIEW
        # Keep fallback note visible to the editor when auto replaced a binding.
        job.error = fallback_note
    await session.flush()
    return job


async def _run_structure_pipeline(
    session: AsyncSession,
    job: ImportJob,
    series: Series,
    *,
    settings: Settings,
) -> ImportJob:
    if not series.events:
        job.status = ImportStatus.FAILED
        job.error = "Structure import requires a series with events"
        await session.flush()
        return job

    data = bytes(job.file_data)
    requested = job.parser_requested
    parser, ctx, fallback_note = _select_structure_parser(job, series, data)
    if (
        requested
        and requested not in {"auto", "ai_only"}
        and parser is not None
        and not parser.supports(ctx, data)
    ):
        job.status = ImportStatus.FAILED
        job.error = (
            f"Парсер {requested} не подходит для этого файла "
            f"(формат/содержимое)"
        )
        await session.flush()
        return job
    if parser is None:
        job.status = ImportStatus.FAILED
        job.error = "ai_unavailable: no structure parser matched"
        if fallback_note:
            job.error = f"{job.error}. {fallback_note}"
        await session.flush()
        return job

    try:
        result = parser.parse(ctx, data)
    except Exception as exc:  # noqa: BLE001
        job.status = ImportStatus.FAILED
        job.error = f"Parser {parser.name} failed: {type(exc).__name__}: {exc}"
        job.parser_used = parser.name
        await session.flush()
        return job

    draft = draft_from_structure_result(result)
    draft = suggest_structure_matches(draft, list(series.events))
    draft = await validate_structure_draft(session, draft, series=series)
    payload = draft_to_dict(draft)

    job.parser_used = parser.name
    job.parse_path = result.parse_path
    job.confidence = draft.confidence
    job.tokens_input = result.tokens_input
    job.tokens_output = result.tokens_output
    job.estimated_cost_usd = result.estimated_cost_usd or Decimal("0")
    job.initial_draft = payload
    job.draft = payload
    job.status = ImportStatus.REVIEW if draft.structures else ImportStatus.FAILED
    job.error = (
        fallback_note
        if draft.structures
        else ("No structures parsed" + (f". {fallback_note}" if fallback_note else ""))
    )
    await session.flush()
    return job


async def apply_draft_update(
    session: AsyncSession,
    job: ImportJob,
    draft: ScheduleImportDraft | StructureImportDraft,
) -> ImportJob:
    if job.series_id is None:
        raise AppError("validation_error", "Import job has no series", 400)
    if job.status not in {ImportStatus.REVIEW, ImportStatus.FAILED}:
        raise AppError("conflict", "Draft can only be edited in review/failed state", 409)

    series = await _load_series(session, job.series_id)
    if job.import_kind == ImportKind.STRUCTURES:
        if not isinstance(draft, StructureImportDraft):
            raise AppError("validation_error", "Expected structures draft", 400)
        validated = await validate_structure_draft(session, draft, series=series)
        job.draft = draft_to_dict(validated)
        if (
            job.status == ImportStatus.FAILED
            and validated.structures
            and not draft_has_errors(validated)
        ):
            job.status = ImportStatus.REVIEW
            job.error = None
        await session.flush()
        return job

    if not isinstance(draft, ScheduleImportDraft):
        raise AppError("validation_error", "Expected schedule draft", 400)
    schedule_draft = await validate_draft(session, draft, series=series)
    schedule_draft = enrich_field_confidence(schedule_draft)
    job.draft = draft_to_dict(schedule_draft)
    if job.initial_draft:
        from app.services.imports.validation import count_field_diffs

        initial = parse_import_draft(job.initial_draft)
        if isinstance(initial, ScheduleImportDraft):
            total, corrected = count_field_diffs(initial, schedule_draft)
            job.fields_total = total
            job.fields_corrected = corrected
    if (
        job.status == ImportStatus.FAILED
        and schedule_draft.events
        and not draft_has_errors(schedule_draft)
    ):
        job.status = ImportStatus.REVIEW
        job.error = None
    await session.flush()
    return job
