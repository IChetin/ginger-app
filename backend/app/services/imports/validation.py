from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.references import Currency
from app.models.schedule import Series
from app.schemas.imports import (
    DraftCellIssue,
    DraftEvent,
    DraftStructure,
    ScheduleImportDraft,
    StructureImportDraft,
)


def _issue(
    *,
    field: str,
    message: str,
    severity: str = "error",
    code: str | None = None,
    event_index: int | None = None,
) -> DraftCellIssue:
    prefix = f"events.{event_index}." if event_index is not None else ""
    return DraftCellIssue(
        field=f"{prefix}{field}",
        severity=severity,  # type: ignore[arg-type]
        message=message,
        code=code,
    )


async def _known_currencies(session: AsyncSession) -> set[str]:
    rows = await session.scalars(select(Currency.code))
    return {code.upper() for code in rows}


async def validate_draft(
    session: AsyncSession,
    draft: ScheduleImportDraft,
    *,
    series: Series,
) -> ScheduleImportDraft:
    currencies = await _known_currencies(session)
    issues: list[DraftCellIssue] = list(draft.issues)
    seen_numbers: dict[int, int] = {}
    events: list[DraftEvent] = []

    if not draft.events:
        issues.append(
            _issue(field="events", message="Draft must contain at least one event", code="empty")
        )

    for index, event in enumerate(draft.events):
        event_issues = [item for item in event.issues if item.severity == "warning"]
        if event.buyin < 0:
            event_issues.append(
                _issue(
                    field="buyin",
                    message="Buy-in cannot be negative",
                    code="buyin_negative",
                    event_index=index,
                )
            )
        elif event.buyin == 0:
            event_issues.append(
                _issue(
                    field="buyin",
                    message="Freeroll: buy-in is 0; check re-entry notes",
                    severity="warning",
                    code="buyin_freeroll",
                    event_index=index,
                )
            )
        if event.currency_code.upper() not in currencies:
            event_issues.append(
                _issue(
                    field="currency_code",
                    message=f"Unknown currency {event.currency_code}",
                    code="currency",
                    event_index=index,
                )
            )
        if event.number is not None:
            if event.number in seen_numbers:
                event_issues.append(
                    _issue(
                        field="number",
                        message=f"Duplicate event number {event.number}",
                        code="duplicate_number",
                        event_index=index,
                    )
                )
            else:
                seen_numbers[event.number] = index

        if event.reentry_unlimited and event.reentry_count is not None:
            event_issues.append(
                _issue(
                    field="reentry_count",
                    message="reentry_count must be empty when unlimited",
                    code="reentry",
                    event_index=index,
                )
            )

        if not event.flights:
            event_issues.append(
                _issue(
                    field="flights",
                    message="At least one flight is required",
                    code="flights_required",
                    event_index=index,
                )
            )

        labels: set[str | None] = set()
        flight_dates: list[date] = []
        for f_idx, flight in enumerate(event.flights):
            if flight.play_date < series.starts_on or flight.play_date > series.ends_on:
                event_issues.append(
                    _issue(
                        field=f"flights.{f_idx}.play_date",
                        message="Flight date is outside series dates",
                        code="date_range",
                        event_index=index,
                    )
                )
            flight_dates.append(flight.play_date)
            if flight.label in labels and flight.label is not None:
                event_issues.append(
                    _issue(
                        field=f"flights.{f_idx}.label",
                        message="Duplicate flight label",
                        code="flight_label",
                        event_index=index,
                    )
                )
            labels.add(flight.label)

        if len(flight_dates) >= 2:
            span = max(flight_dates) - min(flight_dates)
            if span.days > 30:
                event_issues.append(
                    _issue(
                        field="flights",
                        message="Flights span more than 30 days",
                        severity="warning",
                        code="flight_span",
                        event_index=index,
                    )
                )

        # Keep only field-local issues on the event; absolute paths also go to top-level.
        local_issues = [
            DraftCellIssue(
                field=item.field.removeprefix(f"events.{index}."),
                severity=item.severity,
                message=item.message,
                code=item.code,
            )
            for item in event_issues
        ]
        issues.extend(event_issues)
        events.append(event.model_copy(update={"issues": local_issues}))

    confidence = draft.confidence
    error_count = sum(1 for item in issues if item.severity == "error")
    if error_count and confidence is not None:
        confidence = min(confidence, Decimal("0.79"))

    return ScheduleImportDraft(
        events=events,
        unparsed_rows=draft.unparsed_rows,
        confidence=confidence,
        issues=issues,
        series_notes=draft.series_notes,
    )


def draft_has_errors(draft: ScheduleImportDraft | StructureImportDraft) -> bool:
    if any(item.severity == "error" for item in draft.issues):
        return True
    if isinstance(draft, StructureImportDraft):
        return any(
            any(item.severity == "error" for item in structure.issues)
            for structure in draft.structures
        )
    return any(any(item.severity == "error" for item in event.issues) for event in draft.events)


def count_field_diffs(
    initial: ScheduleImportDraft, current: ScheduleImportDraft
) -> tuple[int, int]:
    """Return (fields_total, fields_corrected) for accounting."""
    total = 0
    corrected = 0
    initial_events = {(event.number, event.name): event for event in initial.events}
    for event in current.events:
        key = (event.number, event.name)
        baseline = initial_events.get(key)
        comparable = [
            "number",
            "name",
            "buyin",
            "currency_code",
            "guarantee",
            "game_type",
            "start_stack",
            "reentry_count",
            "reentry_unlimited",
            "late_reg_level",
            "notes",
        ]
        for field in comparable:
            total += 1
            left = getattr(baseline, field) if baseline is not None else None
            right = getattr(event, field)
            if baseline is None or left != right:
                corrected += 1
        total += 1
        if baseline is None or len(baseline.flights) != len(event.flights):
            corrected += 1
        else:
            for left_f, right_f in zip(baseline.flights, event.flights, strict=True):
                total += 3
                if left_f.label != right_f.label:
                    corrected += 1
                if left_f.play_date != right_f.play_date:
                    corrected += 1
                if left_f.play_time != right_f.play_time:
                    corrected += 1
    return total, corrected


async def validate_structure_draft(
    session: AsyncSession,
    draft: StructureImportDraft,
    *,
    series: Series,
) -> StructureImportDraft:
    from sqlalchemy import select

    from app.models.schedule import Event

    event_ids = {
        event_id
        for event_id in await session.scalars(select(Event.id).where(Event.series_id == series.id))
    }
    issues: list[DraftCellIssue] = list(draft.issues)
    structures: list[DraftStructure] = []
    assigned: dict[UUID, int] = {}

    if not draft.structures:
        issues.append(
            _issue(
                field="structures",
                message="Draft must contain at least one structure",
                code="empty",
            )
        )

    for index, structure in enumerate(draft.structures):
        local_issues = [item for item in structure.issues if item.severity == "warning"]
        if structure.selected and not structure.is_shared_satellites:
            if structure.matched_event_id is None:
                local_issues.append(
                    DraftCellIssue(
                        field="matched_event_id",
                        severity="error",
                        message="Selected structure must be matched to an event",
                        code="unmatched",
                    )
                )
            elif structure.matched_event_id not in event_ids:
                local_issues.append(
                    DraftCellIssue(
                        field="matched_event_id",
                        severity="error",
                        message="Matched event does not belong to series",
                        code="bad_match",
                    )
                )
            else:
                if structure.matched_event_id in assigned:
                    local_issues.append(
                        DraftCellIssue(
                            field="matched_event_id",
                            severity="error",
                            message="Event is assigned to multiple structures",
                            code="duplicate_match",
                        )
                    )
                assigned[structure.matched_event_id] = index

        if structure.is_shared_satellites and structure.selected:
            for event_id in structure.shared_event_ids:
                if event_id not in event_ids:
                    local_issues.append(
                        DraftCellIssue(
                            field="shared_event_ids",
                            severity="error",
                            message="Shared satellite target is outside series",
                            code="bad_shared_target",
                        )
                    )
                elif event_id in assigned:
                    local_issues.append(
                        DraftCellIssue(
                            field="shared_event_ids",
                            severity="error",
                            message="Shared satellite target already assigned",
                            code="duplicate_match",
                        )
                    )
                else:
                    assigned[event_id] = index

        for set_index, structure_set in enumerate(structure.structure_sets):
            level_nos = [level.level_no for level in structure_set.levels]
            if len(set(level_nos)) != len(level_nos):
                local_issues.append(
                    DraftCellIssue(
                        field=f"structure_sets.{set_index}.levels",
                        severity="error",
                        message="level_no values must be unique within a set",
                        code="level_unique",
                    )
                )
            if structure.parsed_late_reg_level and structure.parsed_late_reg_level not in level_nos:
                local_issues.append(
                    DraftCellIssue(
                        field="parsed_late_reg_level",
                        severity="warning",
                        message="Late registration level missing from levels",
                        code="late_reg_missing",
                    )
                )

        issues.extend(
            DraftCellIssue(
                field=f"structures.{index}.{item.field}",
                severity=item.severity,
                message=item.message,
                code=item.code,
            )
            for item in local_issues
            if not item.field.startswith("structures.")
        )
        structures.append(structure.model_copy(update={"issues": local_issues}))

    confidence = draft.confidence
    if any(item.severity == "error" for item in issues) and confidence is not None:
        confidence = min(confidence, Decimal("0.79"))
    return StructureImportDraft(
        structures=structures,
        unparsed_rows=draft.unparsed_rows,
        confidence=confidence,
        issues=issues,
    )
