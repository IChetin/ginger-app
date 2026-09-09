"""Enrich draft events with parse_path, source_fragment, field_confidence."""

from __future__ import annotations

from decimal import Decimal

from app.models.enums import ParsePath
from app.schemas.imports import DraftEvent, ScheduleImportDraft

_BASELINE = Decimal("0.95")
_WARN = Decimal("0.55")
_ERROR = Decimal("0.20")
_EMPTY_OPTIONAL = Decimal("0.45")

_EVENT_FIELDS = (
    "number",
    "name",
    "buyin",
    "currency_code",
    "guarantee",
    "game_type",
)


def build_source_fragment(event: DraftEvent) -> str | None:
    if event.source_fragment:
        return event.source_fragment[:2000]
    parts: list[str] = []
    if event.source_sheet:
        parts.append(event.source_sheet)
    if event.source_page is not None:
        parts.append(f"с. {event.source_page}")
    if event.source_row is not None:
        parts.append(f"стр. {event.source_row}")
    parts.append(event.name)
    if event.flights:
        flight = event.flights[0]
        parts.append(f"{flight.play_date.isoformat()} {flight.play_time.strftime('%H:%M')}")
    parts.append(f"{event.buyin} {event.currency_code}")
    text = " · ".join(part for part in parts if part)
    return text[:2000] if text else None


def annotate_events(
    events: list[DraftEvent],
    *,
    parse_path: ParsePath,
    fragments: list[str] | None = None,
) -> list[DraftEvent]:
    """Set per-event parse_path and fill source_fragment when missing."""
    out: list[DraftEvent] = []
    frag_iter = iter(fragments or [])
    for event in events:
        fragment = event.source_fragment
        if not fragment:
            fragment = next(frag_iter, None)
        if not fragment:
            fragment = build_source_fragment(event)
        out.append(
            event.model_copy(
                update={
                    "parse_path": parse_path,
                    "source_fragment": fragment,
                }
            )
        )
    return out


def enrich_field_confidence(draft: ScheduleImportDraft) -> ScheduleImportDraft:
    """Derive per-cell confidence from presence + validation issues."""
    events: list[DraftEvent] = []
    for event in draft.events:
        conf: dict[str, Decimal] = {
            key: Decimal(str(value)) for key, value in event.field_confidence.items()
        }
        for key in _EVENT_FIELDS:
            if key in conf:
                continue
            value = getattr(event, key)
            if value is None and key in {"guarantee", "number"}:
                conf[key] = _EMPTY_OPTIONAL
            else:
                conf[key] = _BASELINE
        for index, flight in enumerate(event.flights):
            for field in ("play_date", "play_time", "label"):
                key = f"flights.{index}.{field}"
                if key in conf:
                    continue
                value = getattr(flight, field)
                if value is None and field in {"label", "play_time"}:
                    conf[key] = _EMPTY_OPTIONAL if field == "label" else _ERROR
                else:
                    conf[key] = _BASELINE
                if flight.confidence is not None:
                    conf[key] = min(conf[key], Decimal(str(flight.confidence)))

        for issue in event.issues:
            field = issue.field
            current = conf.get(field, _BASELINE)
            if issue.severity == "error":
                conf[field] = min(current, _ERROR)
            else:
                conf[field] = min(current, _WARN)

        events.append(event.model_copy(update={"field_confidence": conf}))
    return draft.model_copy(update={"events": events})
