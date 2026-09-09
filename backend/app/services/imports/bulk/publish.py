"""Публикация массовой загрузки: применение плана, change_log и рассылка.

Всё выполняется в транзакции запроса: ошибка в середине откатывает загрузку целиком.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.enums import EventStatus, GameType, ImportKind, ImportStatus, SeriesStatus
from app.models.imports import ImportJob
from app.models.references import Country, Organizer, Venue
from app.models.schedule import ChangeLog, Event, Flight, Series
from app.schemas.bulk_import import (
    BulkImportDraft,
    BulkPreviewResponse,
    BulkPublishReport,
    BulkPublishResponse,
)
from app.services import change_log as change_log_service
from app.services import change_notifications as change_notifications_service
from app.services import notifications as notifications_service
from app.services import slugs as slugs_service
from app.services.imports.bulk.diff import BulkPlan, EventChange, SeriesChange, build_plan
from app.services.imports.bulk.normalize import normalize_key
from app.services.imports.bulk.references import (
    AUTO_COUNTRY_NAMES,
    ReferenceResolution,
    resolve_references,
)
from app.services.imports.bulk.validate import validate_draft
from app.services.preview_tokens import create_preview_token, hash_canonical, verify_preview_token
from app.utils.slugify import slugify


async def _lock_job(session: AsyncSession, job_id: UUID) -> ImportJob:
    job = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
    if job is None:
        raise NotFoundError("Import job not found")
    if job.import_kind != ImportKind.BULK_XLSX:
        raise AppError("validation_error", "Job is not a bulk upload", 400)
    if job.draft is None:
        raise AppError("validation_error", "Draft is empty", 400)
    return job


def load_draft(job: ImportJob) -> BulkImportDraft:
    return BulkImportDraft.model_validate(job.draft)


async def _prepare(
    session: AsyncSession,
    job: ImportJob,
    *,
    mark_missing_cancelled: bool,
) -> tuple[BulkImportDraft, ReferenceResolution, BulkPlan]:
    draft = load_draft(job)
    resolution = await resolve_references(session, draft.series)
    draft = await validate_draft(session, draft, resolution)
    plan = await build_plan(
        session,
        _planning_draft(draft),
        resolution,
        mark_missing_cancelled=mark_missing_cancelled,
    )
    return draft, resolution, plan


def _planning_draft(draft: BulkImportDraft) -> BulkImportDraft:
    """Серии с ошибками из плана убираем: считать по ним нечего, а сломать могут.

    Ошибки всё равно видны в таблице замечаний, а публикация при них запрещена.
    """
    blocked = {
        normalize_key(issue.series_key)
        for issue in draft.issues
        if issue.severity == "error" and issue.series_key
    }
    if not blocked:
        return draft
    return draft.model_copy(
        update={"series": [item for item in draft.series if item.import_key not in blocked]}
    )


def _snapshot(job: ImportJob, draft: BulkImportDraft, plan: BulkPlan) -> dict[str, Any]:
    return {
        "job_id": str(job.id),
        "job_status": job.status.value,
        "draft_hash": hash_canonical(draft.model_dump(mode="json")),
        # План зависит от текущего состояния базы: если её поменяли между
        # предпросмотром и публикацией, токен перестаёт подходить.
        "plan_hash": hash_canonical(plan.digest()),
    }


def _body(mark_missing_cancelled: bool) -> dict[str, Any]:
    return {"mark_missing_cancelled": mark_missing_cancelled}


async def preview_bulk_publish(
    session: AsyncSession,
    job_id: UUID,
    *,
    actor_id: UUID,
    mark_missing_cancelled: bool,
) -> BulkPreviewResponse:
    job = await _lock_job(session, job_id)
    if job.status != ImportStatus.REVIEW:
        raise AppError("conflict", "Only review jobs can be published", 409)

    draft, resolution, plan = await _prepare(
        session,
        job,
        mark_missing_cancelled=mark_missing_cancelled,
    )

    settings = get_settings()
    token, expires_at = create_preview_token(
        actor_id=actor_id,
        entity_type="import",
        entity_id=job.id,
        snapshot_hash=hash_canonical(_snapshot(job, draft, plan)),
        body_hash=hash_canonical(_body(mark_missing_cancelled)),
        settings=settings,
    )
    expires_in = max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
    return BulkPreviewResponse(
        preview_token=token,
        expires_in_seconds=expires_in,
        job_id=job.id,
        mark_missing_cancelled=mark_missing_cancelled,
        series=plan.series_counts,
        events=plan.event_counts,
        flights=plan.flight_counts,
        plans=plan.to_plans(),
        new_references=resolution.as_new_references(),
        impacts=plan.impacts,
        total_recipients=plan.total_recipients,
        issues=draft.issues,
        can_publish=not draft.has_errors,
    )


async def publish_bulk(
    session: AsyncSession,
    job_id: UUID,
    *,
    actor_id: UUID,
    preview_token: str,
    mark_missing_cancelled: bool,
    notify: bool,
) -> BulkPublishResponse:
    job = await _lock_job(session, job_id)
    if job.status != ImportStatus.REVIEW:
        raise AppError("conflict", "Only review jobs can be published", 409)

    draft, resolution, plan = await _prepare(
        session,
        job,
        mark_missing_cancelled=mark_missing_cancelled,
    )
    if draft.has_errors:
        raise AppError("validation_error", "Draft still has validation errors", 400)

    verify_preview_token(
        preview_token,
        actor_id=actor_id,
        entity_type="import",
        entity_id=job.id,
        snapshot_hash=hash_canonical(_snapshot(job, draft, plan)),
        body_hash=hash_canonical(_body(mark_missing_cancelled)),
        settings=get_settings(),
    )

    report = BulkPublishReport(notifications_suppressed=not notify)
    await _create_references(session, resolution, report)

    for change in plan.changes:
        await _apply_series(
            session,
            change,
            resolution=resolution,
            actor_id=actor_id,
            notify=notify,
            report=report,
        )

    draft = draft.model_copy(update={"report": report})
    job.draft = draft.model_dump(mode="json")
    job.status = ImportStatus.PUBLISHED
    job.published_at = datetime.now(UTC)
    job.error = None
    await session.flush()

    return BulkPublishResponse(job_id=job.id, report=report)


async def _create_references(
    session: AsyncSession,
    resolution: ReferenceResolution,
    report: BulkPublishReport,
) -> None:
    for code in sorted(resolution.new_countries):
        name = AUTO_COUNTRY_NAMES.get(code)
        if name is None:
            raise AppError("validation_error", f"Country {code} is not allowed", 400)
        session.add(Country(code=code, name_ru=name))
        resolution.countries.add(code)
        report.countries_created.append(code)
    await session.flush()

    for key, name in resolution.new_organizers.items():
        organizer = Organizer(name=name, slug=await _unique_organizer_slug(session, name))
        session.add(organizer)
        await session.flush()
        resolution.organizers[key] = organizer
        report.organizers_created.append(name)

    for key, new_venue in resolution.new_venues.items():
        venue = Venue(
            country_code=new_venue.country_code,
            city=new_venue.city,
            name=new_venue.name,
            slug=await _unique_venue_slug(session, f"{new_venue.city} {new_venue.name}"),
            timezone=new_venue.timezone,
        )
        session.add(venue)
        await session.flush()
        resolution.venues[key] = venue
        report.venues_created.append(new_venue.name)

    # Тот же порядок, что в блоке «Будут созданы» на предпросмотре.
    report.organizers_created.sort()
    report.venues_created.sort()


async def _unique_organizer_slug(session: AsyncSession, name: str) -> str:
    base = slugify(name, fallback="organizer", max_len=64)
    candidate = base
    suffix = 2
    while await session.scalar(select(Organizer.id).where(Organizer.slug == candidate)) is not None:
        tail = f"-{suffix}"
        candidate = f"{base[: 64 - len(tail)]}{tail}"
        suffix += 1
    return candidate


async def _unique_venue_slug(session: AsyncSession, name: str) -> str:
    base = slugify(name, fallback="venue", max_len=64)
    candidate = base
    suffix = 2
    while await session.scalar(select(Venue.id).where(Venue.slug == candidate)) is not None:
        tail = f"-{suffix}"
        candidate = f"{base[: 64 - len(tail)]}{tail}"
        suffix += 1
    return candidate


async def _apply_series(
    session: AsyncSession,
    change: SeriesChange,
    *,
    resolution: ReferenceResolution,
    actor_id: UUID,
    notify: bool,
    report: BulkPublishReport,
) -> None:
    draft = change.draft
    organizer = resolution.organizer_for(draft.organizer_name)
    venue = resolution.venue_for(draft.venue_name)
    if organizer is None or venue is None:
        raise AppError("validation_error", "Reference data was not created", 500)

    if change.existing is None:
        series = Series(
            organizer_id=organizer.id,
            venue_id=venue.id,
            name=draft.name,
            slug=await slugs_service.allocate_series_slug(
                session,
                organizer_slug=organizer.slug,
                city=draft.city,
                starts_on=draft.starts_on,
            ),
            import_key=draft.import_key,
            starts_on=draft.starts_on,
            ends_on=draft.ends_on,
            status=SeriesStatus.SCHEDULE_PUBLISHED,
            guarantee=draft.guarantee,
            guarantee_currency_code=draft.currency_code if draft.guarantee else None,
            poster_url=draft.poster_url,
            links={"source": draft.source_url} if draft.source_url else {},
        )
        session.add(series)
        await session.flush()
        report.series_created += 1
    else:
        series = change.existing
        if change.action == "unchanged":
            return
        old_snapshot = change_log_service.series_snapshot(series)
        _apply_series_fields(series, change, organizer=organizer, venue=venue)
        await session.flush()
        await _log_series(
            session,
            series=series,
            change=change,
            old_snapshot=old_snapshot,
            actor_id=actor_id,
            notify=notify,
            report=report,
        )
        report.series_updated += 1

    for event_change in change.events:
        await _apply_event(
            session,
            event_change,
            series=series,
            timezone_name=change.timezone_name,
            actor_id=actor_id,
            notify=notify,
            report=report,
        )


def _apply_series_fields(
    series: Series,
    change: SeriesChange,
    *,
    organizer: Organizer,
    venue: Venue,
) -> None:
    draft = change.draft
    changed = {item.field for item in change.diffs}
    if "name" in changed:
        series.name = draft.name
    if "organizer" in changed:
        series.organizer_id = organizer.id
    if "venue" in changed:
        series.venue_id = venue.id
    if "starts_on" in changed:
        series.starts_on = draft.starts_on
    if "ends_on" in changed:
        series.ends_on = draft.ends_on
    if "guarantee" in changed:
        series.guarantee = draft.guarantee
        series.guarantee_currency_code = draft.currency_code
    if "poster_url" in changed:
        series.poster_url = draft.poster_url
    if "source_url" in changed and draft.source_url:
        series.links = {**series.links, "source": draft.source_url}
    if "status" in changed and change.new_status is not None:
        series.status = change.new_status


async def _log_series(
    session: AsyncSession,
    *,
    series: Series,
    change: SeriesChange,
    old_snapshot: dict[str, Any],
    actor_id: UUID,
    notify: bool,
    report: BulkPublishReport,
) -> None:
    change_log = await change_log_service.log_series_update(
        session,
        series=series,
        old_snapshot=old_snapshot,
        actor_id=actor_id,
    )
    if change_log is None:
        return
    await session.flush()

    new_snapshot = change_log_service.series_snapshot(series)
    if notify:
        planned = change_notifications_service.plan_impacts_for_series_update(
            old_snapshot,
            new_snapshot,
            series,
        )
        created = await change_notifications_service.enqueue_planned_notifications(
            session,
            change_log=change_log,
            planned=planned,
        )
        report.notifications_enqueued += len(created)

    if old_snapshot.get("starts_on") != new_snapshot.get("starts_on"):
        await notifications_service.reschedule_series_starting_for_series(
            session,
            series_id=series.id,
        )


async def _apply_event(
    session: AsyncSession,
    change: EventChange,
    *,
    series: Series,
    timezone_name: str,
    actor_id: UUID,
    notify: bool,
    report: BulkPublishReport,
) -> None:
    if change.action == "create":
        await _create_event(
            session,
            change,
            series=series,
            actor_id=actor_id,
            notify=notify,
            report=report,
        )
        return
    if change.existing is None:
        return
    if change.action == "missing" and not change.cancel:
        return
    if change.action == "unchanged":
        return

    event = change.existing
    old_snapshot = change_log_service.event_snapshot(event)
    if change.cancel:
        event.status = EventStatus.CANCELLED
    elif change.draft is not None:
        _apply_event_fields(event, change)
    await session.flush()

    change_logs: list[ChangeLog] = []
    event_log = await change_log_service.log_event_update(
        session,
        event=event,
        old_snapshot=old_snapshot,
        series_status=series.status,
        actor_id=actor_id,
    )
    if event_log is not None:
        change_logs.append(event_log)

    flight_updates, flight_logs = await _apply_flights(
        session,
        change,
        event=event,
        series=series,
        timezone_name=timezone_name,
        actor_id=actor_id,
        report=report,
    )
    change_logs.extend(flight_logs)
    await session.flush()

    if change.cancel:
        report.events_cancelled += 1
    else:
        report.events_updated += 1

    if notify and change_logs:
        planned = change_notifications_service.plan_impacts_for_event_update(
            old_snapshot,
            change_log_service.event_snapshot(event),
            event,
        )
        planned.extend(
            change_notifications_service.plan_impacts_for_flight_updates(flight_updates, event)
        )
        created = await change_notifications_service.enqueue_planned_notifications(
            session,
            change_log=change_logs[0],
            planned=planned,
        )
        report.notifications_enqueued += len(created)
        notified_at = change_logs[0].notified_at
        for entry in change_logs[1:]:
            entry.notified_at = notified_at
        await session.flush()

    for old_flight, new_flight, flight in flight_updates:
        if old_flight.get("start_at") != new_flight.get("start_at"):
            await notifications_service.reschedule_reminders_for_flight(
                session,
                flight_id=flight.id,
            )


def _apply_event_fields(event: Event, change: EventChange) -> None:
    draft = change.draft
    if draft is None:
        return
    changed = {item.field for item in change.diffs}
    if "number" in changed:
        event.number = draft.number
    if "name" in changed:
        event.name = draft.name
    if "buyin" in changed:
        event.buyin = draft.buyin
    if "buyin_bounty" in changed:
        event.buyin_bounty = draft.buyin_bounty
    if "guarantee" in changed:
        event.guarantee = draft.guarantee
    if "game_type" in changed and draft.game_type is not None:
        event.game_type = draft.game_type
    if "tags" in changed:
        event.tags = list(draft.tags)
    if "start_stack" in changed:
        event.start_stack = draft.start_stack
    if "start_blinds" in changed:
        event.start_blinds = draft.start_blinds
    if "reentry" in changed:
        event.reentry_count = draft.reentry_count
        event.reentry_unlimited = draft.reentry_unlimited
    if "late_reg_level" in changed:
        event.late_reg_level = draft.late_reg_level
    if "day_end_note" in changed:
        event.day_end_note = draft.day_end_note
    if "status" in changed and draft.status is not None:
        event.status = draft.status
    if "notes" in changed:
        event.notes = draft.notes


async def _create_event(
    session: AsyncSession,
    change: EventChange,
    *,
    series: Series,
    actor_id: UUID,
    notify: bool,
    report: BulkPublishReport,
) -> None:
    draft = change.draft
    if draft is None:
        return
    event = Event(
        series_id=series.id,
        number=draft.number,
        name=draft.name,
        slug=await slugs_service.allocate_event_slug(
            session,
            series.id,
            number=draft.number,
            name=draft.name,
        ),
        import_key=draft.import_key,
        buyin=draft.buyin,
        buyin_bounty=draft.buyin_bounty,
        currency_code=draft.currency_code,
        guarantee=draft.guarantee,
        game_type=draft.game_type or GameType.NLH,
        tags=list(draft.tags),
        start_stack=draft.start_stack,
        start_blinds=draft.start_blinds,
        reentry_count=draft.reentry_count,
        reentry_unlimited=draft.reentry_unlimited,
        late_reg_level=draft.late_reg_level,
        day_end_note=draft.day_end_note,
        status=draft.status or EventStatus.SCHEDULED,
        notes=draft.notes,
    )
    session.add(event)
    await session.flush()
    report.events_created += 1

    await change_log_service.log_event_create(
        session,
        event=event,
        series_status=series.status,
        actor_id=actor_id,
    )

    for flight_change in change.flights:
        if flight_change.start_at is None:
            continue
        flight = Flight(
            event_id=event.id,
            label=flight_change.label,
            start_at=flight_change.start_at,
            level_minutes=flight_change.level_minutes,
        )
        session.add(flight)
        await session.flush()
        report.flights_created += 1
        await change_log_service.log_flight_create(
            session,
            flight=flight,
            series_status=series.status,
            actor_id=actor_id,
        )

    # Новый турнир только пишется в change_log: пуша «появился турнир» в продукте нет.
    await session.flush()


async def _apply_flights(
    session: AsyncSession,
    change: EventChange,
    *,
    event: Event,
    series: Series,
    timezone_name: str,
    actor_id: UUID,
    report: BulkPublishReport,
) -> tuple[list[tuple[dict[str, Any], dict[str, Any], Flight]], list[ChangeLog]]:
    updates: list[tuple[dict[str, Any], dict[str, Any], Flight]] = []
    logs: list[ChangeLog] = []

    for flight_change in change.flights:
        if flight_change.start_at is None:
            continue
        if flight_change.action == "create":
            flight = Flight(
                event_id=event.id,
                label=flight_change.label,
                start_at=flight_change.start_at,
                level_minutes=flight_change.level_minutes,
            )
            session.add(flight)
            await session.flush()
            report.flights_created += 1
            created_log = await change_log_service.log_flight_create(
                session,
                flight=flight,
                series_status=series.status,
                actor_id=actor_id,
            )
            if created_log is not None:
                logs.append(created_log)
            continue

        if flight_change.action != "update" or flight_change.existing is None:
            continue
        flight = flight_change.existing
        old_snapshot = change_log_service.flight_snapshot(flight)
        flight.start_at = flight_change.start_at
        if flight_change.level_minutes is not None:
            flight.level_minutes = flight_change.level_minutes
        await session.flush()
        report.flights_updated += 1
        updates.append((old_snapshot, change_log_service.flight_snapshot(flight), flight))
        updated_log = await change_log_service.log_flight_update(
            session,
            flight=flight,
            old_snapshot=old_snapshot,
            series_status=series.status,
            actor_id=actor_id,
        )
        if updated_log is not None:
            logs.append(updated_log)

    if updates or logs:
        event.updated_at = datetime.now(UTC)
    return updates, logs


__all__ = [
    "load_draft",
    "preview_bulk_publish",
    "publish_bulk",
]
