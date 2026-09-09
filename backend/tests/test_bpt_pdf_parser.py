from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.services.imports.base import ParserContext
from app.services.imports.parsers.bpt_pdf import BelarusPokerTourPdfParser

pytestmark = pytest.mark.unit

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "parsers"
OCR_GOLDEN = FIXTURES / "BPT53_9-19_января.ocr.txt"
PDF_FIXTURE = FIXTURES / "BPT53_9-19_января.pdf"


def test_bpt_parser_from_ocr_golden() -> None:
    text = OCR_GOLDEN.read_text(encoding="utf-8")
    parser = BelarusPokerTourPdfParser()
    result = parser.parse_ocr_text(text, year=2026)

    assert result.parser_used == "bpt_pdf_v1"
    assert result.unparsed_rows == []
    assert result.series_notes is not None
    assert "размеров" in result.series_notes
    assert "финальном" in result.series_notes.lower() or "финальном" in result.series_notes

    by_name = {event.name: event for event in result.events}
    grand = by_name["Grand event"]
    assert grand.buyin == Decimal("250")
    assert grand.buyin_bounty == Decimal("50")
    assert grand.currency_code == "USD"
    assert [flight.label for flight in grand.flights] == ["1A", "1B", "1C", "Final"]
    assert grand.late_reg_level == 12
    assert grand.day_end_note == "16 уров."
    assert "bounty" in grand.tags
    assert "KO" not in grand.name and "$50" not in grand.name

    main = by_name["Main event"]
    assert main.buyin == Decimal("400")
    assert [flight.label for flight in main.flights] == ["1A", "1B", "Day 2", "Final"]
    assert "TV" in main.tags
    assert main.notes and "closed" in main.notes.lower()

    welcome = by_name["Welcome event"]
    assert welcome.buyin == Decimal("175")
    assert welcome.buyin_bounty == Decimal("50")
    assert welcome.late_reg_level == 10
    assert welcome.notes is not None
    assert "16:40" in welcome.notes

    # Closed rows must not become separate zero-buyin tournaments.
    assert all(event.buyin > 0 for event in result.events)

    belarus = by_name["Belarus open event"]
    assert "mystery" in belarus.tags
    assert len(belarus.flights) == 2

    # Different satellite buy-ins stay separate.
    satellites = [event for event in result.events if "Satellite to HighRoller" in event.name]
    assert len(satellites) >= 2


def test_bpt_parser_supports_bpt_pdf() -> None:
    data = PDF_FIXTURE.read_bytes()
    parser = BelarusPokerTourPdfParser()
    ctx = ParserContext(
        filename="BPT53.pdf",
        detected_type="pdf",
        organizer_slug="bpt",
        series_id=None,
        series_starts_on=date(2026, 1, 9),
        series_ends_on=date(2026, 1, 19),
        import_kind="schedule",
    )
    assert parser.supports(ctx, data)
    other = ParserContext(
        filename="other.pdf",
        detected_type="pdf",
        organizer_slug="rpf",
        series_id=None,
        import_kind="schedule",
    )
    assert not parser.supports(other, data)


def test_bpt_closed_rows_survive_ocr_junk() -> None:
    """Live OCR often glues level minutes / TV icon noise onto closed titles."""
    parser = BelarusPokerTourPdfParser()
    text = "\n".join(
        [
            "09.01 пятница",
            "12:00 Belarus open event (triple mystery*)(KO $75) $225 30000 30 9 | 17:15 100/200",
            "14.01 среда",
            "12:00 Belarus open event (triple mistery*)(final day) 30/40 ~—closed 4000/8 000",
            "16.01 пятница",
            "12:00 Main event (day 1A) $400 100000 40 14 | 22:20 200/400 14 уров.",
            "19.01 понедельник",
            "12:00 — Main event (final day) (final table) _ © В 40/60 closed",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026)
    assert result.unparsed_rows == []
    assert not any(issue.code == "closed_orphan" for issue in result.issues)
    by_name = {event.name: event for event in result.events}
    assert set(by_name) == {"Belarus open event", "Main event"}
    assert [flight.label for flight in by_name["Belarus open event"].flights] == ["1", "Final"]
    assert [flight.label for flight in by_name["Main event"].flights] == ["1A", "Final"]
    assert "TV" in by_name["Main event"].tags
    assert by_name["Belarus open event"].buyin == Decimal("225")
    assert by_name["Main event"].buyin == Decimal("400")


@pytest.mark.slow
def test_bpt_pdf_ocr_end_to_end() -> None:
    """Optional live OCR — skipped unless tesseract is available."""
    pytesseract = pytest.importorskip("pytesseract")
    try:
        pytesseract.get_tesseract_version()
    except Exception:  # noqa: BLE001
        pytest.skip("tesseract binary not available")

    data = PDF_FIXTURE.read_bytes()
    parser = BelarusPokerTourPdfParser()
    ctx = ParserContext(
        filename="BPT53_9-19_января.pdf",
        detected_type="pdf",
        organizer_slug="bpt",
        series_id=None,
        series_starts_on=date(2026, 1, 9),
        series_ends_on=date(2026, 1, 19),
        default_currency_code="BYN",
        import_kind="schedule",
    )
    result = parser.parse(ctx, data)
    by_name = {event.name: event for event in result.events}
    assert "Grand event" in by_name
    assert len(by_name["Grand event"].flights) == 4
    assert "Main event" in by_name
    # Live OCR may drop a dense final-day row; golden-text test covers the full 4.
    assert len(by_name["Main event"].flights) >= 3
    assert by_name["Grand event"].currency_code == "USD"
    assert result.series_notes or result.unparsed_rows is not None
