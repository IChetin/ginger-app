from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from app.schemas.imports import ParseResult, StructureParseResult


@dataclass(frozen=True)
class ParserContext:
    filename: str
    detected_type: str
    organizer_slug: str | None
    series_id: str | None
    series_starts_on: date | None = None
    series_ends_on: date | None = None
    venue_timezone: str | None = None
    default_currency_code: str | None = None
    import_kind: str = "schedule"
    # When True, skip organizer_slug gate in supports() (explicit / bound selection).
    skip_organizer_slug_check: bool = False


def organizer_slug_allowed(parser_slugs: frozenset[str], ctx: ParserContext) -> bool:
    """Return True if organizer slug matches parser or check is skipped."""
    if ctx.skip_organizer_slug_check:
        return True
    return ctx.organizer_slug in {None, *parser_slugs}


class ScheduleParser(Protocol):
    name: str
    organizer_slugs: frozenset[str]

    def supports(self, ctx: ParserContext, data: bytes) -> bool: ...

    def parse(self, ctx: ParserContext, data: bytes) -> ParseResult: ...


class StructureParser(Protocol):
    name: str
    organizer_slugs: frozenset[str]

    def supports(self, ctx: ParserContext, data: bytes) -> bool: ...

    def parse(self, ctx: ParserContext, data: bytes) -> StructureParseResult: ...
