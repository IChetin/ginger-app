from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.models.schedule import Event
from app.schemas.imports import DraftStructure, StructureImportDraft
from app.services.imports.parsers.common import token_similarity


def suggest_structure_matches(
    draft: StructureImportDraft,
    events: list[Event],
) -> StructureImportDraft:
    """Attach best-effort event matches; never auto-select duplicates."""
    used: set[UUID] = set()
    updated: list[DraftStructure] = []
    for structure in draft.structures:
        if structure.is_shared_satellites:
            satellite_ids = [
                event.id
                for event in events
                if "satellite" in (event.name or "").lower()
                or "satellite" in {tag.lower() for tag in (event.tags or [])}
            ]
            updated.append(
                structure.model_copy(
                    update={
                        "matched_event_id": None,
                        "shared_event_ids": satellite_ids,
                        "match_confidence": Decimal("0.7") if satellite_ids else Decimal("0.2"),
                        "selected": bool(satellite_ids),
                    }
                )
            )
            continue

        best_event: Event | None = None
        best_score = Decimal("0")
        for event in events:
            if event.id in used:
                continue
            score = token_similarity(structure.source_title, event.name)
            if structure.parsed_buyin is not None and event.buyin is not None:
                if structure.parsed_buyin == event.buyin:
                    score = min(Decimal("1"), score + Decimal("0.25"))
                else:
                    # Soft penalty for mismatched buy-in.
                    score = max(Decimal("0"), score - Decimal("0.15"))
            if score > best_score:
                best_score = score
                best_event = event

        matched_id = (
            best_event.id if best_event is not None and best_score >= Decimal("0.45") else None
        )
        if matched_id is not None:
            used.add(matched_id)
        updated.append(
            structure.model_copy(
                update={
                    "matched_event_id": matched_id,
                    "match_confidence": best_score if matched_id is not None else Decimal("0"),
                    "selected": matched_id is not None,
                }
            )
        )
    return draft.model_copy(update={"structures": updated})
