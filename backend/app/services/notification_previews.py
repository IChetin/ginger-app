from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.enums import SeriesStatus
from app.models.schedule import Event, Series
from app.schemas.notifications import (
    FieldDiff,
    NotificationImpactItem,
    NotificationPreviewResponse,
)
from app.services import change_log as change_log_service
from app.services import change_notifications as change_notifications_service
from app.services.change_notifications import PlannedNotification
from app.services.preview_tokens import create_preview_token, hash_canonical


def _requires_confirmation_for_series(
    *,
    old_status: SeriesStatus,
    new_status: SeriesStatus,
    diffs: list[FieldDiff],
) -> bool:
    if not diffs:
        return False
    change_type = change_log_service.resolve_series_change_type(
        old_status=old_status,
        new_status=new_status,
    )
    return change_type is not None


def _requires_confirmation_for_published(
    *,
    series_status: SeriesStatus,
    diffs: list[FieldDiff],
) -> bool:
    if not diffs:
        return False
    return change_log_service.is_series_published(series_status)


async def impacts_from_planned(
    session: AsyncSession,
    planned: list[PlannedNotification],
) -> tuple[list[NotificationImpactItem], int]:
    impacts: list[NotificationImpactItem] = []
    all_users: set[UUID] = set()
    target_cache: dict[
        tuple[
            str,
            UUID | None,
            UUID | None,
            UUID | None,
            tuple[UUID, ...],
        ],
        list[UUID],
    ] = {}
    for item in planned:
        cache_key = (
            item.target.kind,
            item.target.series_id,
            item.target.event_id,
            item.target.flight_id,
            tuple(item.target.flight_ids),
        )
        if cache_key not in target_cache:
            target_cache[cache_key] = await change_notifications_service.resolve_target_user_ids(
                session,
                item.target,
            )
        user_ids = target_cache[cache_key]
        all_users.update(user_ids)
        impacts.append(
            NotificationImpactItem(
                type=item.type,
                title=item.title,
                body=item.body,
                url=item.url,
                recipient_count=len(user_ids),
            )
        )
    return impacts, len(all_users)


def build_preview_response(
    *,
    actor_id: UUID,
    entity_type: str,
    entity_id: UUID,
    snapshot: dict[str, Any],
    body: Any,
    diffs: list[FieldDiff],
    impacts: list[NotificationImpactItem],
    total_recipients: int,
    requires_confirmation: bool,
    settings: Settings | None = None,
) -> NotificationPreviewResponse:
    settings = settings or get_settings()
    token, expires_at = create_preview_token(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        snapshot_hash=hash_canonical(snapshot),
        body_hash=hash_canonical(body),
        settings=settings,
    )
    expires_in = max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
    return NotificationPreviewResponse(
        preview_token=token,
        expires_in_seconds=expires_in,
        entity_type=entity_type,  # type: ignore[arg-type]
        entity_id=entity_id,
        diffs=diffs,
        impacts=impacts,
        total_recipients=total_recipients,
        requires_confirmation=requires_confirmation,
    )


async def preview_series_update(
    session: AsyncSession,
    *,
    series: Series,
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
    body: Any,
    actor_id: UUID,
) -> NotificationPreviewResponse:
    diffs = change_notifications_service.build_field_diffs(old_snapshot, new_snapshot)
    planned = change_notifications_service.plan_impacts_for_series_update(
        old_snapshot,
        new_snapshot,
        series,
    )
    impacts, total = await impacts_from_planned(session, planned)
    requires = _requires_confirmation_for_series(
        old_status=SeriesStatus(old_snapshot["status"]),
        new_status=SeriesStatus(new_snapshot["status"]),
        diffs=diffs,
    )
    return build_preview_response(
        actor_id=actor_id,
        entity_type="series",
        entity_id=series.id,
        snapshot=old_snapshot,
        body=body,
        diffs=diffs,
        impacts=impacts,
        total_recipients=total,
        requires_confirmation=requires,
    )


async def preview_event_update(
    session: AsyncSession,
    *,
    event: Event,
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
    body: Any,
    actor_id: UUID,
    series_status: SeriesStatus,
) -> NotificationPreviewResponse:
    diffs = change_notifications_service.build_field_diffs(old_snapshot, new_snapshot)
    planned = change_notifications_service.plan_impacts_for_event_update(
        old_snapshot,
        new_snapshot,
        event,
    )
    impacts, total = await impacts_from_planned(session, planned)
    requires = _requires_confirmation_for_published(series_status=series_status, diffs=diffs)
    return build_preview_response(
        actor_id=actor_id,
        entity_type="event",
        entity_id=event.id,
        snapshot=old_snapshot,
        body=body,
        diffs=diffs,
        impacts=impacts,
        total_recipients=total,
        requires_confirmation=requires,
    )


async def preview_flight_updates(
    session: AsyncSession,
    *,
    event: Event,
    updates: list[tuple[dict[str, Any], dict[str, Any], Any]],
    body: Any,
    actor_id: UUID,
    series_status: SeriesStatus,
    aggregate_old_snapshot: dict[str, Any],
) -> NotificationPreviewResponse:
    diffs: list[FieldDiff] = []
    for old_snapshot, new_snapshot, flight in updates:
        flight_diffs = change_notifications_service.build_field_diffs(old_snapshot, new_snapshot)
        for diff in flight_diffs:
            label = flight.label or "default"
            diffs.append(
                FieldDiff(
                    field=f"flight[{label}].{diff.field}",
                    old_value=diff.old_value,
                    new_value=diff.new_value,
                )
            )
    planned = change_notifications_service.plan_impacts_for_flight_updates(updates, event)
    impacts, total = await impacts_from_planned(session, planned)
    requires = _requires_confirmation_for_published(series_status=series_status, diffs=diffs)
    return build_preview_response(
        actor_id=actor_id,
        entity_type="flight",
        entity_id=event.id,
        snapshot=aggregate_old_snapshot,
        body=body,
        diffs=diffs,
        impacts=impacts,
        total_recipients=total,
        requires_confirmation=requires,
    )
