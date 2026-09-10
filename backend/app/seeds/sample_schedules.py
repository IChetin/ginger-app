from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import EventStatus, SeriesStatus
from app.models.schedule import BlindLevel, Event, Flight, Series
from app.schemas.imports import (
    DraftEvent,
    DraftFlight,
    ScheduleImportDraft,
    StructureImportDraft,
    draft_from_parse_result,
    draft_from_structure_result,
)
from app.seeds.data import ORGANIZERS, VENUES, VenueSeed
from app.services.imports.base import ParserContext
from app.services.imports.matching import suggest_structure_matches
from app.services.imports.parsers.apc_xlsx import AmberPokerChampionshipXlsxParser
from app.services.imports.parsers.common import detect_game_type, detect_tags
from app.services.imports.parsers.rpf_pdf import RussianPokerFestivalPdfParser
from app.services.imports.parsers.rpt_structure_pdf import RptTournamentStructurePdfParser
from app.services.imports.validation import (
    draft_has_errors,
    validate_draft,
    validate_structure_draft,
)
from app.utils.timezone import venue_local_to_utc

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).resolve().parents[3] / "docs" / "rasp_samples"

SAMPLE_APC_SERIES_ID = uuid.UUID("30000000-0000-4000-8000-000000000001")
SAMPLE_RPF_SERIES_ID = uuid.UUID("30000000-0000-4000-8000-000000000002")
SAMPLE_RPT_SERIES_ID = uuid.UUID("30000000-0000-4000-8000-000000000003")

_EVENT_NAMESPACE = uuid.UUID("30000000-0000-4000-8000-000000000010")
_FLIGHT_NAMESPACE = uuid.UUID("30000000-0000-4000-8000-000000000011")

# Backward-compatible aliases for tests and local dev.
DEMO_SERIES_ID = SAMPLE_RPF_SERIES_ID


def _organizer_id(slug: str) -> uuid.UUID:
    return next(item["id"] for item in ORGANIZERS if item["slug"] == slug)


def _venue(slug: str) -> VenueSeed:
    by_name = {
        "nicosia": next(item for item in VENUES if item["name"] == "Никосия"),
        "kaliningrad": next(item for item in VENUES if item["name"] == "Калининград"),
        "krasnaya_polyana": next(item for item in VENUES if item["name"] == "Красная Поляна"),
    }
    return by_name[slug]


def _event_id(series_id: uuid.UUID, number: int | None, name: str) -> uuid.UUID:
    return uuid.uuid5(_EVENT_NAMESPACE, f"{series_id}:{number}:{name}")


def _flight_id(event_id: uuid.UUID, label: str | None) -> uuid.UUID:
    return uuid.uuid5(_FLIGHT_NAMESPACE, f"{event_id}:{label or ''}")


DEMO_EVENT_MAIN_ID = _event_id(SAMPLE_RPF_SERIES_ID, 35, "Main Event")


def _fixture_bytes(name: str) -> bytes:
    path = FIXTURES_DIR / name
    if not path.is_file():
        raise FileNotFoundError(f"Sample fixture not found: {path}")
    return path.read_bytes()


def _sanitize_schedule_draft(draft: ScheduleImportDraft) -> ScheduleImportDraft:
    """Make parser output publishable: dedupe numbers/labels, drop parser collision markers."""
    seen_numbers: set[int] = set()
    max_number = max((event.number or 0) for event in draft.events)
    next_number = max_number + 1
    events: list[DraftEvent] = []

    for event in draft.events:
        number = event.number
        if number is None or number in seen_numbers:
            number = next_number
            next_number += 1
        seen_numbers.add(number)

        seen_labels: set[str | None] = set()
        flights: list[DraftFlight] = []
        for flight in event.flights:
            label = flight.label
            if label is not None and label in seen_labels:
                suffix = 2
                candidate = f"{label}#{suffix}"
                while candidate in seen_labels:
                    suffix += 1
                    candidate = f"{label}#{suffix}"
                label = candidate
            if label is not None:
                seen_labels.add(label)
            flights.append(flight.model_copy(update={"label": label}))

        cleaned_issues = [
            item
            for item in event.issues
            if item.code not in {"duplicate_source_number", "flight_label"}
        ]
        events.append(
            event.model_copy(
                update={"number": number, "flights": flights, "issues": cleaned_issues}
            )
        )

    cleaned_top = [
        item
        for item in draft.issues
        if item.code not in {"duplicate_source_number", "flight_label"}
    ]
    return draft.model_copy(update={"events": events, "issues": cleaned_top})


@dataclass(frozen=True)
class _SeriesSpec:
    id: uuid.UUID
    organizer_slug: str
    venue_key: str
    name: str
    starts_on: date
    ends_on: date
    description: str


async def _upsert_series(session: AsyncSession, spec: _SeriesSpec) -> Series:
    venue = _venue(spec.venue_key)
    today = date.today()
    if spec.ends_on < today:
        status = SeriesStatus.FINISHED
    elif spec.starts_on <= today <= spec.ends_on:
        status = SeriesStatus.RUNNING
    else:
        status = SeriesStatus.SCHEDULE_PUBLISHED

    existing = await session.scalar(select(Series).where(Series.id == spec.id))
    if existing is None:
        from app.services import slugs as slugs_service

        slug = await slugs_service.allocate_series_slug(
            session,
            organizer_slug=spec.organizer_slug,
            city=str(venue["city"]),
            starts_on=spec.starts_on,
        )
        series = Series(
            id=spec.id,
            organizer_id=_organizer_id(spec.organizer_slug),
            venue_id=venue["id"],
            name=spec.name,
            slug=slug,
            starts_on=spec.starts_on,
            ends_on=spec.ends_on,
            status=status,
            poster_url=None,
            links={},
            description=spec.description,
        )
        session.add(series)
    else:
        series = existing
        series.organizer_id = _organizer_id(spec.organizer_slug)
        series.venue_id = venue["id"]
        series.name = spec.name
        series.starts_on = spec.starts_on
        series.ends_on = spec.ends_on
        series.status = status
        series.description = spec.description
        if not series.slug:
            from app.services import slugs as slugs_service

            series.slug = await slugs_service.allocate_series_slug(
                session,
                organizer_slug=spec.organizer_slug,
                city=str(venue["city"]),
                starts_on=spec.starts_on,
                exclude_id=series.id,
            )

    await session.flush()
    await session.refresh(series, attribute_names=["venue"])
    return series


async def _replace_series_schedule(
    session: AsyncSession,
    *,
    series: Series,
    draft: ScheduleImportDraft,
) -> None:
    """Пересобирает сетку демо-серии, сохраняя id турниров и стартов.

    Удалять всё и создавать заново нельзя: на демо-данных живут закладки ручного
    тестирования. Поэтому id турниров и стартов детерминированы, а сид обновляет
    существующие строки.
    """
    from app.services import slugs as slugs_service

    venue_tz = series.venue.timezone
    keep_ids = {_event_id(series.id, item.number, item.name) for item in draft.events}
    # Сначала чистим устаревшее, иначе слаг нового турнира получит суффикс из-за
    # строки, которая через мгновение будет удалена.
    await _drop_stale_events(session, series=series, keep_ids=keep_ids)

    existing_events = {
        event.id: event
        for event in await session.scalars(
            select(Event).where(Event.series_id == series.id).options(selectinload(Event.flights))
        )
    }

    for item in draft.events:
        event_id = _event_id(series.id, item.number, item.name)
        db_event = existing_events.get(event_id)
        # У новой строки коллекции ещё нет, а ленивая подгрузка в async-сессии запрещена.
        flights_by_id = {flight.id: flight for flight in db_event.flights} if db_event else {}
        if db_event is None:
            db_event = Event(
                id=event_id,
                series_id=series.id,
                slug=await slugs_service.allocate_event_slug(
                    session,
                    series.id,
                    number=item.number,
                    name=item.name,
                ),
            )
            session.add(db_event)

        db_event.number = item.number
        db_event.name = item.name
        db_event.buyin = item.buyin
        db_event.currency_code = item.currency_code
        db_event.guarantee = item.guarantee
        db_event.game_type = item.game_type
        db_event.tags = list(item.tags)
        db_event.start_stack = item.start_stack
        db_event.reentry_count = item.reentry_count
        db_event.reentry_unlimited = item.reentry_unlimited
        db_event.late_reg_level = item.late_reg_level
        db_event.status = EventStatus.SCHEDULED
        db_event.notes = item.notes
        await session.flush()

        seen_flight_ids: set[uuid.UUID] = set()
        for flight in item.flights:
            flight_id = _flight_id(event_id, flight.label)
            seen_flight_ids.add(flight_id)
            local_dt = datetime.combine(flight.play_date, flight.play_time)
            db_flight = flights_by_id.get(flight_id)
            if db_flight is None:
                db_flight = Flight(id=flight_id, event_id=db_event.id, label=flight.label)
                session.add(db_flight)
            db_flight.start_at = venue_local_to_utc(local_dt, venue_tz)

        stale_flights = [id_ for id_ in flights_by_id if id_ not in seen_flight_ids]
        if stale_flights:
            await session.execute(delete(Flight).where(Flight.id.in_(stale_flights)))

    await session.flush()


async def _drop_stale_events(
    session: AsyncSession,
    *,
    series: Series,
    keep_ids: set[uuid.UUID],
) -> None:
    """Убирает турниры, которых больше нет в образце, кроме тронутых пользователем."""
    stale = [
        event_id
        for event_id in await session.scalars(select(Event.id).where(Event.series_id == series.id))
        if event_id not in keep_ids
    ]
    if not stale:
        return

    await session.execute(delete(Event).where(Event.id.in_(stale)))
    await session.flush()


async def _apply_structures(
    session: AsyncSession,
    *,
    series: Series,
    draft: StructureImportDraft,
) -> int:
    events = list(await session.scalars(select(Event).where(Event.series_id == series.id)))
    events_by_id = {event.id: event for event in events}
    applied = 0

    for structure in draft.structures:
        if not structure.selected:
            continue

        target_ids: list[uuid.UUID]
        if structure.is_shared_satellites:
            target_ids = list(structure.shared_event_ids)
        elif structure.matched_event_id is not None:
            target_ids = [structure.matched_event_id]
        else:
            continue

        for event_id in target_ids:
            event = events_by_id.get(event_id)
            if event is None:
                continue

            await session.execute(delete(BlindLevel).where(BlindLevel.event_id == event.id))
            for structure_set in structure.structure_sets:
                for level in structure_set.levels:
                    session.add(
                        BlindLevel(
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
                    )
            if structure.parsed_start_stack is not None:
                event.start_stack = structure.parsed_start_stack
            if structure.parsed_late_reg_level is not None:
                event.late_reg_level = structure.parsed_late_reg_level
            applied += 1

    await session.flush()
    return applied


def _schedule_context(
    *,
    filename: str,
    detected_type: str,
    organizer_slug: str,
    series: Series,
    venue_timezone: str,
    default_currency_code: str,
) -> ParserContext:
    return ParserContext(
        filename=filename,
        detected_type=detected_type,
        organizer_slug=organizer_slug,
        series_id=str(series.id),
        series_starts_on=series.starts_on,
        series_ends_on=series.ends_on,
        venue_timezone=venue_timezone,
        default_currency_code=default_currency_code,
        import_kind="schedule",
    )


async def _seed_apc_series(session: AsyncSession) -> None:
    venue = _venue("nicosia")
    spec = _SeriesSpec(
        id=SAMPLE_APC_SERIES_ID,
        organizer_slug="apc",
        venue_key="nicosia",
        name="APC-43 · New Year's Poker Festival",
        starts_on=date(2026, 7, 1),
        ends_on=date(2026, 7, 14),
        description="Сид из docs/rasp_samples/расписание APC-43.xlsx (apc_xlsx_v1).",
    )
    series = await _upsert_series(session, spec)
    ctx = _schedule_context(
        filename="расписание APC-43.xlsx",
        detected_type="xlsx",
        organizer_slug="apc",
        series=series,
        venue_timezone=str(venue["timezone"]),
        default_currency_code="EUR",
    )
    result = AmberPokerChampionshipXlsxParser().parse(ctx, _fixture_bytes("расписание APC-43.xlsx"))
    draft = _sanitize_schedule_draft(draft_from_parse_result(result))
    draft = await validate_draft(session, draft, series=series)
    if draft_has_errors(draft):
        raise RuntimeError("APC sample draft still has validation errors after sanitizing")

    await _replace_series_schedule(session, series=series, draft=draft)
    logger.info(
        "APC sample schedule seeded (series_id=%s, events=%s)", series.id, len(draft.events)
    )


async def _seed_rpf_series(session: AsyncSession) -> None:
    venue = _venue("kaliningrad")
    spec = _SeriesSpec(
        id=SAMPLE_RPF_SERIES_ID,
        organizer_slug="rpf",
        venue_key="kaliningrad",
        name="RPF 17–30 августа",
        starts_on=date(2026, 8, 17),
        ends_on=date(2026, 8, 30),
        description="Сид из docs/rasp_samples/RPF 17-30 августа.pdf (rpf_pdf_v1).",
    )
    series = await _upsert_series(session, spec)
    ctx = _schedule_context(
        filename="RPF 17-30 августа.pdf",
        detected_type="pdf",
        organizer_slug="rpf",
        series=series,
        venue_timezone=str(venue["timezone"]),
        default_currency_code="RUB",
    )
    result = RussianPokerFestivalPdfParser().parse(ctx, _fixture_bytes("RPF 17-30 августа.pdf"))
    draft = _sanitize_schedule_draft(draft_from_parse_result(result))
    draft = await validate_draft(session, draft, series=series)
    if draft_has_errors(draft):
        raise RuntimeError("RPF sample draft still has validation errors after sanitizing")

    await _replace_series_schedule(session, series=series, draft=draft)
    logger.info(
        "RPF sample schedule seeded (series_id=%s, events=%s)", series.id, len(draft.events)
    )


def _placeholder_events_from_structures(
    structures_draft: StructureImportDraft,
    *,
    series_id: uuid.UUID,
    starts_on: date,
    currency_code: str,
) -> ScheduleImportDraft:
    events: list[DraftEvent] = []
    number = 1
    for index, structure in enumerate(structures_draft.structures):
        if structure.is_shared_satellites:
            continue
        title = structure.source_title
        lower = title.lower()
        tags = list(detect_tags(title))
        if ("stage to" in lower or "satellite" in lower) and "satellite" not in tags:
            tags.append("satellite")
        play_date = starts_on + timedelta(days=index % 11)
        buyin = structure.parsed_buyin if structure.parsed_buyin is not None else Decimal("0")
        events.append(
            DraftEvent(
                number=number,
                name=title.strip(),
                buyin=buyin,
                currency_code=currency_code,
                game_type=detect_game_type(title),
                tags=tags,
                start_stack=structure.parsed_start_stack,
                late_reg_level=structure.parsed_late_reg_level,
                flights=[
                    DraftFlight(
                        label=None,
                        play_date=play_date,
                        play_time=time(14, 0),
                    )
                ],
            )
        )
        number += 1
    return ScheduleImportDraft(
        events=events, unparsed_rows=[], confidence=Decimal("0.9"), issues=[]
    )


async def _seed_rpt_altai_series(session: AsyncSession) -> None:
    venue = _venue("krasnaya_polyana")
    spec = _SeriesSpec(
        id=SAMPLE_RPT_SERIES_ID,
        organizer_slug="rpt",
        venue_key="krasnaya_polyana",
        name="RPT Altai",
        starts_on=date(2026, 7, 3),
        ends_on=date(2026, 7, 13),
        description=(
            "Сид: события по заголовкам из "
            "docs/rasp_samples/RPT_Altai_03-13_July_2026_Tournament_Structure.pdf, "
            "структуры блайндов — rpt_structure_pdf_v1."
        ),
    )
    series = await _upsert_series(session, spec)

    structure_ctx = ParserContext(
        filename="RPT_Altai_03-13_July_2026_Tournament_Structure.pdf",
        detected_type="pdf",
        organizer_slug="rpt",
        series_id=str(series.id),
        series_starts_on=series.starts_on,
        series_ends_on=series.ends_on,
        venue_timezone=str(venue["timezone"]),
        default_currency_code="RUB",
        import_kind="structures",
    )
    structure_result = RptTournamentStructurePdfParser().parse(
        structure_ctx,
        _fixture_bytes("RPT_Altai_03-13_July_2026_Tournament_Structure.pdf"),
    )
    structures_draft = draft_from_structure_result(structure_result)
    schedule_draft = _placeholder_events_from_structures(
        structures_draft,
        series_id=series.id,
        starts_on=series.starts_on,
        currency_code="RUB",
    )
    schedule_draft = await validate_draft(session, schedule_draft, series=series)
    if draft_has_errors(schedule_draft):
        raise RuntimeError("RPT Altai placeholder schedule has validation errors")

    await _replace_series_schedule(session, series=series, draft=schedule_draft)

    events = list(
        await session.scalars(
            select(Event)
            .where(Event.series_id == series.id)
            .options(selectinload(Event.blind_levels))
        )
    )
    matched = suggest_structure_matches(structures_draft, events)
    matched = matched.model_copy(
        update={
            "structures": [
                structure.model_copy(update={"selected": False})
                if structure.is_shared_satellites
                else structure
                for structure in matched.structures
            ]
        }
    )
    matched = await validate_structure_draft(session, matched, series=series)
    if draft_has_errors(matched):
        raise RuntimeError("RPT Altai structure draft has validation errors after matching")

    applied = await _apply_structures(session, series=series, draft=matched)
    logger.info(
        "RPT Altai sample seeded (series_id=%s, events=%s, structures_applied=%s)",
        series.id,
        len(events),
        applied,
    )


async def seed_sample_schedules(session: AsyncSession) -> None:
    await _seed_apc_series(session)
    await _seed_rpf_series(session)
    await _seed_rpt_altai_series(session)


async def seed_demo_schedule(session: AsyncSession) -> None:
    """Backward-compatible entry point used by tests and db-init."""
    await seed_sample_schedules(session)
