"""Импорт сетки клуба из файла союза: разбор → шаблоны → старты.

Парсер выбирается по союзу клуба. Готов только NUTS (CSV); для Black Sea и Poker21 источники —
картинки, их распознавание пока не сделано (в Day2 ИИ-распознавание — заглушка).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.schemas.tournaments import TemplateParseResult, TemplatesImportResult
from app.services.clubs import get_club
from app.services.tournaments import manual_csv, nuts_csv
from app.services.tournaments.schedule_sync import apply_templates_import

# Союз → (источник шаблонов, парсер).
_PARSERS: dict[str, tuple[str, Callable[[bytes], TemplateParseResult]]] = {
    "nuts": (nuts_csv.SOURCE, nuts_csv.parse_nuts_csv),
}


async def import_club_templates(
    session: AsyncSession,
    club_id: UUID,
    data: bytes,
    *,
    dry_run: bool,
    now: datetime | None = None,
) -> TemplatesImportResult:
    settings = get_settings()
    if len(data) > settings.import_max_file_bytes:
        raise AppError("file_too_large", "Файл слишком большой", 413)
    club = await get_club(session, club_id)
    union = club.organizer.slug if club.organizer else None
    # Ручная сетка (наш CSV) подходит любому клубу; иначе — парсер формата союза.
    source: str
    parse: Callable[[bytes], TemplateParseResult]
    if manual_csv.looks_like_manual_csv(data):
        source, parse = manual_csv.SOURCE, manual_csv.parse_manual_csv
    elif union in _PARSERS:
        source, parse = _PARSERS[union]
    else:
        raise AppError(
            "no_template_parser",
            "Формат не распознан: для этого клуба загрузите ручную сетку "
            f"(колонки {', '.join(manual_csv.REQUIRED_COLUMNS)})",
            422,
        )
    try:
        parsed = parse(data)
    except (nuts_csv.NutsCsvError, manual_csv.ManualCsvError, UnicodeDecodeError) as error:
        raise AppError("unrecognized_file", f"Файл не распознан: {error}", 422) from error

    # Предпросмотр — тот же импорт внутри savepoint, который затем откатывается: счётчики
    # честные, а в базе ничего не остаётся.
    nested = await session.begin_nested() if dry_run else None
    templates, tournaments = await apply_templates_import(
        session,
        club.id,
        parsed.templates,
        source=source,
        now=now,
        horizon_days=settings.schedule_horizon_days,
    )
    if nested is not None:
        await nested.rollback()

    return TemplatesImportResult(
        dry_run=dry_run,
        rows_total=parsed.rows_total,
        templates_parsed=len(parsed.templates),
        issues=parsed.issues,
        templates_created=templates.created,
        templates_updated=templates.updated,
        templates_unchanged=templates.unchanged,
        templates_removed=len(templates.stale_template_ids),
        tournaments_created=tournaments.created,
        tournaments_updated=tournaments.updated,
        tournaments_deleted=tournaments.deleted,
        tournaments_detached_kept=tournaments.detached_kept,
    )
