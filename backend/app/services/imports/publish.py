from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.enums import EventStatus, ImportKind, ImportStatus, SeriesStatus
from app.models.imports import ImportJob
from app.models.schedule import BlindLevel, Event, Flight, Series
from app.schemas.imports import (
    ImportPublishPreviewResponse,
    ImportPublishResponse,
    ScheduleImportDraft,
    StructureImportDraft,
    parse_import_draft,
)
from app.schemas.notifications import FieldDiff
from app.services import change_log as change_log_service
from app.services import change_notifications as change_notifications_service
from app.services import notifications as notifications_service
from app.services.imports.validation import (
    draft_has_errors,
    validate_draft,
    validate_structure_draft,
)
from app.services.notification_previews import impacts_from_planned
from app.services.preview_tokens import create_preview_token, hash_canonical, verify_preview_token
from app.utils.timezone import venue_local_to_utc


async def _lock_job(session: AsyncSession, job_id: UUID) -> ImportJob:
    job = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
    if job is None:
        raise NotFoundError("Import job not found")
    return job


async def _lock_series(session: AsyncSession, series_id: UUID) -> Series:
    series = await session.scalar(
        select(Series)
        .where(Series.id == series_id)
        .options(
            selectinload(Series.organizer),
            selectinload(Series.venue),
            selectinload(Series.events).selectinload(Event.blind_levels),
        )
        .with_for_update()
    )
    if series is None:
        raise NotFoundError("Series not found")
    return series


def _publish_body(draft: ScheduleImportDraft | StructureImportDraft) -> dict[str, Any]:
    return {"draft": draft.model_dump(mode="json")}


def _snapshot(
    job: ImportJob,
    series: Series,
    draft: ScheduleImportDraft | StructureImportDraft,
) -> dict[str, Any]:
    return {
        "job_id": str(job.id),
        "job_status": job.status.value,
        "import_kind": job.import_kind.value,
        "series_id": str(series.id),
        "series_status": series.status.value,
        "events_count": len(series.events),
        "draft_hash": hash_canonical(draft.model_dump(mode="json")),
    }


def _selected_structure_count(draft: StructureImportDraft) -> int:
    count = 0
    for structure in draft.structures:
        if not structure.selected:
            continue
        if structure.is_shared_satellites:
            count += len(structure.shared_event_ids)
        elif structure.matched_event_id is not None:
            count += 1
    return count


async def preview_publish(
    session: AsyncSession,
    job_id: UUID,
    *,
    actor_id: UUID,
) -> ImportPublishPreviewResponse:
    job = await _lock_job(session, job_id)
    if job.series_id is None:
        raise AppError("validation_error", "Import job has no series", 400)
    if job.status != ImportStatus.REVIEW:
        raise AppError("conflict", "Only review jobs can be published", 409)
    if job.draft is None:
        raise AppError("validation_error", "Draft is empty", 400)

    series = await _lock_series(session, job.series_id)
    draft = parse_import_draft(job.draft)
    if draft is None:
        raise AppError("validation_error", "Draft is empty", 400)

    if job.import_kind == ImportKind.STRUCTURES:
        if not isinstance(draft, StructureImportDraft):
            raise AppError("validation_error", "Expected structures draft", 400)
        if not series.events:
            raise AppError("conflict", "Structure publish requires existing events", 409)
        draft = await validate_structure_draft(session, draft, series=series)
        if draft_has_errors(draft):
            raise AppError("validation_error", "Draft still has validation errors", 400)
        selected = _selected_structure_count(draft)
        if selected == 0:
            raise AppError("validation_error", "Select at least one structure mapping", 400)
        diffs = [
            FieldDiff(field="structures_applied", old_value=0, new_value=selected),
        ]
        impacts: list[Any] = []
        total_recipients = 0
        events_to_create = 0
        structures_to_apply = selected
    else:
        if not isinstance(draft, ScheduleImportDraft):
            raise AppError("validation_error", "Expected schedule draft", 400)
        if series.events:
            raise AppError("conflict", "Import publish requires an empty series", 409)
        draft = await validate_draft(session, draft, series=series)
        if draft_has_errors(draft):
            raise AppError("validation_error", "Draft still has validation errors", 400)
        old_snapshot = change_log_service.series_snapshot(series)
        new_snapshot = dict(old_snapshot)
        new_snapshot["status"] = SeriesStatus.SCHEDULE_PUBLISHED.value
        planned = change_notifications_service.plan_impacts_for_series_update(
            old_snapshot,
            new_snapshot,
            series,
        )
        impacts, total_recipients = await impacts_from_planned(session, planned)
        diffs = [
            FieldDiff(
                field="status",
                old_value=series.status.value,
                new_value=SeriesStatus.SCHEDULE_PUBLISHED.value,
            ),
            FieldDiff(field="events_created", old_value=0, new_value=len(draft.events)),
        ]
        events_to_create = len(draft.events)
        structures_to_apply = 0

    settings = get_settings()
    body = _publish_body(draft)
    snapshot = _snapshot(job, series, draft)
    token, expires_at = create_preview_token(
        actor_id=actor_id,
        entity_type="import",
        entity_id=job.id,
        snapshot_hash=hash_canonical(snapshot),
        body_hash=hash_canonical(body),
        settings=settings,
    )
    expires_in = max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
    return ImportPublishPreviewResponse(
        preview_token=token,
        expires_in_seconds=expires_in,
        entity_id=job.id,
        series_id=series.id,
        import_kind=job.import_kind,
        diffs=diffs,
        impacts=impacts,
        total_recipients=total_recipients,
        requires_confirmation=True,
        events_to_create=events_to_create,
        structures_to_apply=structures_to_apply,
    )


async def publish_import(
    session: AsyncSession,
    job_id: UUID,
    *,
    actor_id: UUID,
    preview_token: str,
) -> ImportPublishResponse:
    job = await _lock_job(session, job_id)
    if job.series_id is None:
        raise AppError("validation_error", "Import job has no series", 400)
    if job.status != ImportStatus.REVIEW:
        raise AppError("conflict", "Only review jobs can be published", 409)
    if job.draft is None:
        raise AppError("validation_error", "Draft is empty", 400)

    series = await _lock_series(session, job.series_id)
    draft = parse_import_draft(job.draft)
    if draft is None:
        raise AppError("validation_error", "Draft is empty", 400)

    if job.import_kind == ImportKind.STRUCTURES:
        return await _publish_structures(
            session,
            job=job,
            series=series,
            draft=draft,  # type: ignore[arg-type]
            actor_id=actor_id,
            preview_token=preview_token,
        )
    return await _publish_schedule(
        session,
        job=job,
        series=series,
        draft=draft,  # type: ignore[arg-type]
        actor_id=actor_id,
        preview_token=preview_token,
    )


async def _publish_schedule(
    session: AsyncSession,
    *,
    job: ImportJob,
    series: Series,
    draft: ScheduleImportDraft,
    actor_id: UUID,
    preview_token: str,
) -> ImportPublishResponse:
    if series.events:
        raise AppError("conflict", "Import publish requires an empty series", 409)
    draft = await validate_draft(session, draft, series=series)
    if draft_has_errors(draft):
        raise AppError("validation_error", "Draft still has validation errors", 400)

    body = _publish_body(draft)
    snapshot = _snapshot(job, series, draft)
    verify_preview_token(
        preview_token,
        actor_id=actor_id,
        entity_type="import",
        entity_id=job.id,
        snapshot_hash=hash_canonical(snapshot),
        body_hash=hash_canonical(body),
        settings=get_settings(),
    )

    from app.models.references import Currency

    currency_codes = {event.currency_code for event in draft.events}
    if currency_codes:
        found_codes = set(
            await session.scalars(select(Currency.code).where(Currency.code.in_(currency_codes)))
        )
        missing = currency_codes - found_codes
        if missing:
            code = sorted(missing)[0]
            raise AppError(
                "validation_error",
                f"Currency {code} not found",
                400,
            )

    old_series_snapshot = change_log_service.series_snapshot(series)
    time_zone = job.file_timezone or series.venue.timezone
    created = 0

    if draft.series_notes:
        note = draft.series_notes.strip()
        if note:
            if series.description:
                if note not in series.description:
                    series.description = f"{series.description.rstrip()}\n\n{note}"
            else:
                series.description = note

    from app.services import slugs as slugs_service

    for item in draft.events:
        event_slug = await slugs_service.allocate_event_slug(
            session,
            series.id,
            number=item.number,
            name=item.name,
        )
        db_event = Event(
            series_id=series.id,
            number=item.number,
            name=item.name,
            slug=event_slug,
            buyin=item.buyin,
            buyin_bounty=item.buyin_bounty,
            currency_code=item.currency_code,
            guarantee=item.guarantee,
            game_type=item.game_type,
            tags=item.tags,
            start_stack=item.start_stack,
            reentry_count=item.reentry_count,
            reentry_unlimited=item.reentry_unlimited,
            late_reg_level=item.late_reg_level,
            day_end_note=item.day_end_note,
            status=EventStatus.SCHEDULED,
            notes=item.notes,
        )
        session.add(db_event)
        await session.flush()
        for flight in item.flights:
            local_dt = datetime.combine(flight.play_date, flight.play_time)
            start_at = venue_local_to_utc(local_dt, time_zone)
            session.add(
                Flight(
                    event_id=db_event.id,
                    label=flight.label,
                    start_at=start_at,
                )
            )
        created += 1

    await session.flush()
    series.status = SeriesStatus.SCHEDULE_PUBLISHED
    await session.flush()

    change_log = await change_log_service.log_series_update(
        session,
        series=series,
        old_snapshot=old_series_snapshot,
        actor_id=actor_id,
    )
    if change_log is not None:
        merged_new = dict(change_log.new_value or {})
        merged_new["via"] = "import"
        merged_new["import_job_id"] = str(job.id)
        merged_new["events_created"] = created
        change_log.new_value = change_log_service.json_safe(merged_new)
        await session.flush()
        new_snapshot = change_log_service.series_snapshot(series)
        planned = change_notifications_service.plan_impacts_for_series_update(
            old_series_snapshot,
            new_snapshot,
            series,
        )
        await change_notifications_service.enqueue_planned_notifications(
            session,
            change_log=change_log,
            planned=planned,
        )
        await notifications_service.reschedule_series_starting_for_series(
            session,
            series_id=series.id,
        )

    from app.services.imports.validation import count_field_diffs

    if job.initial_draft:
        initial = parse_import_draft(job.initial_draft)
        if isinstance(initial, ScheduleImportDraft):
            total, corrected = count_field_diffs(initial, draft)
            job.fields_total = total
            job.fields_corrected = corrected

    job.draft = draft.model_dump(mode="json")
    job.status = ImportStatus.PUBLISHED
    job.published_at = datetime.now(UTC)
    job.error = None
    await session.flush()

    count = await session.scalar(
        select(func.count()).select_from(Event).where(Event.series_id == series.id)
    )
    if count != created:
        raise AppError("conflict", "Failed to create all events", 500)

    return ImportPublishResponse(
        import_job_id=job.id,
        series_id=series.id,
        events_created=created,
        structures_applied=0,
    )


async def _publish_structures(
    session: AsyncSession,
    *,
    job: ImportJob,
    series: Series,
    draft: StructureImportDraft,
    actor_id: UUID,
    preview_token: str,
) -> ImportPublishResponse:
    if not series.events:
        raise AppError("conflict", "Structure publish requires existing events", 409)
    draft = await validate_structure_draft(session, draft, series=series)
    if draft_has_errors(draft):
        raise AppError("validation_error", "Draft still has validation errors", 400)
    selected = _selected_structure_count(draft)
    if selected == 0:
        raise AppError("validation_error", "Select at least one structure mapping", 400)

    body = _publish_body(draft)
    snapshot = _snapshot(job, series, draft)
    verify_preview_token(
        preview_token,
        actor_id=actor_id,
        entity_type="import",
        entity_id=job.id,
        snapshot_hash=hash_canonical(snapshot),
        body_hash=hash_canonical(body),
        settings=get_settings(),
    )

    events_by_id = {event.id: event for event in series.events}
    applied = 0
    for structure in draft.structures:
        if not structure.selected:
            continue
        target_ids: list[UUID]
        if structure.is_shared_satellites:
            target_ids = list(structure.shared_event_ids)
        elif structure.matched_event_id is not None:
            target_ids = [structure.matched_event_id]
        else:
            continue

        for event_id in target_ids:
            event = events_by_id.get(event_id)
            if event is None:
                raise AppError("validation_error", "Matched event disappeared", 409)
            old_levels = change_log_service.blind_levels_snapshot(list(event.blind_levels))
            await session.execute(delete(BlindLevel).where(BlindLevel.event_id == event.id))
            new_levels: list[BlindLevel] = []
            for structure_set in structure.structure_sets:
                for level in structure_set.levels:
                    row = BlindLevel(
                        event_id=event.id,
                        structure_set_label=structure_set.label or "default",
                        level_no=level.level_no,
                        sb=level.sb,
                        bb=level.bb,
                        ante=level.ante,
                        minutes=level.minutes,
                        is_break=level.is_break,
                        is_late_reg_end=level.is_late_reg_end,
                    )
                    session.add(row)
                    new_levels.append(row)
            if structure.parsed_start_stack is not None:
                event.start_stack = structure.parsed_start_stack
            if structure.parsed_late_reg_level is not None:
                event.late_reg_level = structure.parsed_late_reg_level
            await session.flush()
            await change_log_service.log_blind_levels_update(
                session,
                event_id=event.id,
                old_levels=old_levels,
                new_levels=change_log_service.blind_levels_snapshot(new_levels),
                series_status=series.status,
                actor_id=actor_id,
            )
            applied += 1

    job.draft = draft.model_dump(mode="json")
    job.status = ImportStatus.PUBLISHED
    job.published_at = datetime.now(UTC)
    job.error = None
    await session.flush()
    return ImportPublishResponse(
        import_job_id=job.id,
        series_id=series.id,
        events_created=0,
        structures_applied=applied,
    )
