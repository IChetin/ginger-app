from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.services.imports.base import ParserContext
from app.services.imports.parsers.apc_xlsx import AmberPokerChampionshipXlsxParser
from app.services.imports.parsers.rpf_pdf import RussianPokerFestivalPdfParser
from app.services.imports.parsers.rpt_structure_pdf import RptTournamentStructurePdfParser

pytestmark = pytest.mark.unit

FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "rasp_samples"


def test_apc_xlsx_parser_groups_flights_and_flags_duplicate_number() -> None:
    data = (FIXTURES / "расписание APC-43.xlsx").read_bytes()
    ctx = ParserContext(
        filename="apc.xlsx",
        detected_type="xlsx",
        organizer_slug="apc",
        series_id=None,
        series_starts_on=date(2026, 7, 1),
        series_ends_on=date(2026, 7, 14),
        import_kind="schedule",
    )
    parser = AmberPokerChampionshipXlsxParser()
    assert parser.supports(ctx, data)
    result = parser.parse(ctx, data)
    assert len(result.events) == 74
    assert result.confidence >= Decimal("0.8")
    event_two = next(event for event in result.events if event.number == 2)
    assert len(event_two.flights) == 5
    assert {flight.label for flight in event_two.flights} >= {"1X", "1Y", "1Z", "Day 2", "Final"}
    freeroll = next(event for event in result.events if event.buyin == 0)
    assert "freeroll" in freeroll.tags or freeroll.buyin == 0
    duplicates = [
        event
        for event in result.events
        if any(issue.code == "duplicate_source_number" for issue in event.issues)
    ]
    assert [event.number for event in duplicates] == [28, 28]


def test_rpf_pdf_parser_builds_main_event_flights() -> None:
    data = (FIXTURES / "RPF 17-30 августа.pdf").read_bytes()
    ctx = ParserContext(
        filename="rpf.pdf",
        detected_type="pdf",
        organizer_slug="rpf",
        series_id=None,
        series_starts_on=date(2026, 8, 17),
        series_ends_on=date(2026, 8, 30),
        import_kind="schedule",
    )
    parser = RussianPokerFestivalPdfParser()
    assert parser.supports(ctx, data)
    result = parser.parse(ctx, data)
    assert len(result.events) == 61
    freeroll = next(event for event in result.events if event.number == 1)
    assert freeroll.buyin == 0
    assert [flight.label for flight in freeroll.flights] == ["1A", "1B", "1C", "1D", "Final"]
    main = next(event for event in result.events if event.number == 35)
    assert main.buyin == Decimal("70000")
    assert [flight.label for flight in main.flights] == [
        "1A",
        "1B",
        "1C",
        "Day 2",
        "Day 3",
        "Final",
    ]
    plo = next(event for event in result.events if event.number == 31)
    assert plo.game_type.value == "plo5"


def test_rpt_structure_parser_reads_sets_and_shared_satellites() -> None:
    data = (FIXTURES / "RPT_Altai_03-13_July_2026_Tournament_Structure.pdf").read_bytes()
    ctx = ParserContext(
        filename="rpt.pdf",
        detected_type="pdf",
        organizer_slug="rpt",
        series_id=None,
        import_kind="structures",
    )
    parser = RptTournamentStructurePdfParser()
    assert parser.supports(ctx, data)
    schedule_ctx = ParserContext(
        filename="rpt.pdf",
        detected_type="pdf",
        organizer_slug="rpt",
        series_id=None,
        import_kind="schedule",
    )
    assert not parser.supports(schedule_ctx, data)
    result = parser.parse(ctx, data)
    assert len(result.structures) == 22
    assert result.structures[-1].is_shared_satellites is True
    rpo = next(
        structure
        for structure in result.structures
        if "RUSSIAN POKER OPEN" in structure.source_title
    )
    assert [item.label for item in rpo.structure_sets] == ["1A", "1B"]
    assert len(rpo.structure_sets[0].levels) >= 10
    omaha = next(
        structure for structure in result.structures if "5-CARDS OMAHA" in structure.source_title
    )
    assert omaha.structure_sets[0].levels[0].ante is None
    assert omaha.structure_sets[0].levels[0].minutes == 20
