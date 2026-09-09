"""Sync in-memory parser registry → parser_profiles rows."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.imports import ParserProfile
from app.models.references import Organizer

logger = logging.getLogger(__name__)

# Human-readable defaults when creating a profile for a newly registered parser.
_DEFAULT_TITLES: dict[str, str] = {
    "apc_xlsx_v1": "APC · Excel (Анонс)",
    "rpf_pdf_v1": "RPF · PDF",
    "bpt_pdf_v1": "BPT · PDF / OCR",
    "rpt_schedule_ocr_v1": "RPT · расписание JPG/OCR",
    "rpt_structure_pdf_v1": "RPT · структуры PDF",
}

# Legacy organizer_slugs → default binding (only applied when organizer FK is NULL).
_DEFAULT_SCHEDULE_BINDINGS: dict[str, str] = {
    "apc": "apc_xlsx_v1",
    "rpf": "rpf_pdf_v1",
    "bpt": "bpt_pdf_v1",
    "rpt": "rpt_schedule_ocr_v1",
}
_DEFAULT_STRUCTURE_BINDINGS: dict[str, str] = {
    "rpt": "rpt_structure_pdf_v1",
}


@dataclass(frozen=True)
class _RegistryEntry:
    code: str
    kind: str
    description: str
    organizer_slugs: frozenset[str]
    supported_types: frozenset[str]


def _collect_registry() -> list[_RegistryEntry]:
    from app.services.imports.parsers import register_builtin_parsers
    from app.services.imports.registry import list_parsers, list_structure_parsers

    register_builtin_parsers()
    entries: list[_RegistryEntry] = []
    for parser in list_parsers():
        entries.append(
            _RegistryEntry(
                code=parser.name,
                kind="schedule",
                description=str(getattr(parser, "description", "") or ""),
                organizer_slugs=frozenset(parser.organizer_slugs),
                supported_types=frozenset(getattr(parser, "supported_types", frozenset())),
            )
        )
    for parser in list_structure_parsers():
        entries.append(
            _RegistryEntry(
                code=parser.name,
                kind="structures",
                description=str(getattr(parser, "description", "") or ""),
                organizer_slugs=frozenset(parser.organizer_slugs),
                supported_types=frozenset(getattr(parser, "supported_types", frozenset())),
            )
        )
    return entries


def default_title_for(code: str, description: str = "") -> str:
    if code in _DEFAULT_TITLES:
        return _DEFAULT_TITLES[code]
    if description:
        return description[:128]
    return code


async def sync_parser_profiles(session: AsyncSession) -> list[ParserProfile]:
    """Upsert profiles for every registered parser; mark missing ones unavailable."""
    entries = _collect_registry()
    by_code = {entry.code: entry for entry in entries}
    existing = list(await session.scalars(select(ParserProfile)))
    existing_by_code = {row.code: row for row in existing}

    for entry in entries:
        row = existing_by_code.get(entry.code)
        if row is None:
            row = ParserProfile(
                code=entry.code,
                title=default_title_for(entry.code, entry.description),
                kind=entry.kind,
                is_active=True,
                is_available=True,
            )
            session.add(row)
            existing_by_code[entry.code] = row
            logger.info("parser profile created: %s", entry.code)
        else:
            row.kind = entry.kind
            row.is_available = True
            # Do not overwrite title / is_active / notes — those are editor-owned.

    for code, row in existing_by_code.items():
        if code not in by_code and row.is_available:
            row.is_available = False
            logger.info("parser profile marked unavailable: %s", code)

    await session.flush()
    return list(existing_by_code.values())


async def apply_default_organizer_bindings(session: AsyncSession) -> None:
    """Fill NULL organizer parser FKs from legacy slug→code map (idempotent)."""
    profiles = {
        row.code: row
        for row in await session.scalars(select(ParserProfile))
    }
    organizers = list(await session.scalars(select(Organizer)))
    for organizer in organizers:
        if organizer.schedule_parser_id is None:
            code = _DEFAULT_SCHEDULE_BINDINGS.get(organizer.slug)
            profile = profiles.get(code) if code else None
            if profile is not None and profile.kind == "schedule":
                organizer.schedule_parser_id = profile.id
        if organizer.structure_parser_id is None:
            code = _DEFAULT_STRUCTURE_BINDINGS.get(organizer.slug)
            profile = profiles.get(code) if code else None
            if profile is not None and profile.kind == "structures":
                organizer.structure_parser_id = profile.id
    await session.flush()
