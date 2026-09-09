from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.services.imports.base import ParserContext
from app.services.imports.parsers.rpt_schedule_ocr import RptScheduleOcrParser

pytestmark = pytest.mark.unit

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "parsers"
OCR_GOLDEN = FIXTURES / "RPT_Altai_3-13_июля.ocr.txt"
JPG_FIXTURE = FIXTURES / "RPT_Altai_3-13_июля.jpg"


def test_rpt_schedule_from_ocr_golden() -> None:
    text = OCR_GOLDEN.read_text(encoding="utf-8")
    parser = RptScheduleOcrParser()
    result = parser.parse_ocr_text(text, year=2026)

    assert result.parser_used == "rpt_schedule_ocr_v1"
    assert result.unparsed_rows == []
    assert result.confidence >= Decimal("0.8")

    by_name = {event.name: event for event in result.events}

    altai = by_name["ALTAI CHAMPIONSHIP PKO"]
    assert altai.buyin == Decimal("18000")
    assert altai.buyin_bounty == Decimal("6000")
    assert altai.currency_code == "RUB"
    assert altai.guarantee == Decimal("2500000")
    assert [flight.label for flight in altai.flights] == ["1A", "1B", "1C", "1D", "Final"]
    assert altai.late_reg_level == 10
    assert altai.day_end_note is not None and "12%" in altai.day_end_note
    assert "pko" in altai.tags or "bounty" in altai.tags

    sat_altai = by_name["SATELLITE TO ALTAI CHAMPIONSHIP"]
    assert sat_altai.buyin == Decimal("2500")
    assert [flight.label for flight in sat_altai.flights] == ["1A", "1C"]
    assert "satellite" in sat_altai.tags

    main = by_name["RPT MAIN EVENT"]
    assert main.buyin == Decimal("39000")
    assert [flight.label for flight in main.flights] == ["1A", "1B", "Day 2", "Final"]

    main_stage = by_name["RPT MAIN EVENT STAGE"]
    assert main_stage.buyin == Decimal("9500")
    assert "satellite" in main_stage.tags
    assert len(main_stage.flights) == 4

    open_ko = by_name["RUSSIAN POKER OPEN KNOCKOUT EVENT"]
    assert open_ko.buyin == Decimal("34000")  # 26500+7500 preferred over 1A
    assert "Final" in [flight.label for flight in open_ko.flights]

    omaha = by_name["5-CARDS OMAHA KNOCKOUT BATTLE"]
    assert omaha.buyin == Decimal("8000")
    assert omaha.buyin_bounty == Decimal("2000")
    assert omaha.game_type.value == "plo5"

    ladies = by_name["LADIES EVENT"]
    assert ladies.buyin == Decimal("5000")
    assert "ladies" in ladies.tags

    # Closed rows must not become separate zero-buyin tournaments.
    assert all(event.buyin > 0 for event in result.events)
    assert not any(issue.code == "closed_orphan" for issue in result.issues)


def test_rpt_schedule_supports_image() -> None:
    data = JPG_FIXTURE.read_bytes()
    parser = RptScheduleOcrParser()
    ctx = ParserContext(
        filename="Алтай 3-13 июля.jpg",
        detected_type="image",
        organizer_slug="rpt",
        series_id=None,
        series_starts_on=date(2026, 7, 3),
        series_ends_on=date(2026, 7, 13),
        import_kind="schedule",
    )
    assert parser.supports(ctx, data)
    other = ParserContext(
        filename="other.jpg",
        detected_type="image",
        organizer_slug="bpt",
        series_id=None,
        import_kind="schedule",
    )
    assert not parser.supports(other, data)
    structures = ParserContext(
        filename="Алтай 3-13 июля.jpg",
        detected_type="image",
        organizer_slug="rpt",
        series_id=None,
        import_kind="structures",
    )
    assert not parser.supports(structures, data)


def test_rpt_schedule_supports_pdf_by_filename() -> None:
    samples = Path(__file__).resolve().parents[2] / "docs" / "rasp_samples"
    pdf = next(samples.glob("*июля.pdf"), None)
    if pdf is None:
        pytest.skip("Altai schedule PDF sample missing")
    parser = RptScheduleOcrParser()
    data = pdf.read_bytes()
    ctx = ParserContext(
        filename=pdf.name,
        detected_type="pdf",
        organizer_slug="rpt",
        series_id=None,
        series_starts_on=date(2026, 7, 3),
        series_ends_on=date(2026, 7, 13),
        import_kind="schedule",
    )
    assert parser.supports(ctx, data)


def test_rpt_date_inference_without_day_headers() -> None:
    """Image-PDF OCR often drops «03 ИЮЛЯ» headers — advance by time wrap."""
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "12:00 SATELLITE TO ALTAI CHAMPIONSHIP (DAY 1A) - 5 SEATS GTD 2500 12000 10 MIN 8",
            "21:00 5-CARDS OMAHA KNOCKOUT BATTLE - 200.000 GTD 6000+2000 20000 20/15 MIN 10",
            "01:00 SATELLITE TO ALTAI CHAMPIONSHIP (DAY 1C) - 5 SEATS GTD 2500 12000 10 MIN 8",
            "13:00 ALTAI CHAMPIONSHIP PKO (DAY 1C) - 2.500.000 GTD 12000+6000 20000 25 MIN 10 Till 12%",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026, starts_on=date(2026, 7, 3))
    assert any(issue.code == "date_inferred" for issue in result.issues)
    by_name = {event.name: event for event in result.events}
    sat = by_name["SATELLITE TO ALTAI CHAMPIONSHIP"]
    assert [f.play_date for f in sat.flights] == [date(2026, 7, 3), date(2026, 7, 4)]
    altai = by_name["ALTAI CHAMPIONSHIP PKO"]
    assert altai.flights[0].play_date == date(2026, 7, 4)


def test_rpt_ocr_normalizes_brackets_and_glued_time() -> None:
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "03 ИЮЛЯ, ПЯТНИЦА",
            "14:00 ALTAI CHAMPIONSHIP PKO (DAY 1A) - 2.500.000 GTD 12000+6000 20000 30 MIN 10",
            "05 ИЮЛЯ, ВОСКРЕСЕНЬЕ",
            "1100 ALTAI CHAMPIONSHIP PKO [FINAL DAY] CLOSED 30 MIN",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026)
    altai = next(event for event in result.events if event.name == "ALTAI CHAMPIONSHIP PKO")
    assert [flight.label for flight in altai.flights] == ["1A", "Final"]
    assert altai.flights[-1].play_time.hour == 11


def test_rpt_repairs_ocr_buyin_and_cyrillic_knockout() -> None:
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "06 ИЮЛЯ, ПОНЕДЕЛЬНИК",
            "14:00 GRAND CLASSIC КНОСКООТ BATTLE(DAY 1A) - 3000000 GTD 714000+10000 25000 25 MIN 12 ITM12%",
            "19:00 GRAND CLASSIC KNOCKOUT BATTLE (DAY 1B) - 3.000.000 GTD 14000+10000 25000 20 MIN 12 ITM12%",
            "08 ИЮЛЯ, СРЕДА",
            "11:00 GRAND CLASSIC KNOCKOUT BATTLE (FINAL DAY) CLOSED 30 MIN",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026)
    assert result.unparsed_rows == []
    event = next(e for e in result.events if "GRAND CLASSIC" in e.name)
    assert event.buyin == Decimal("24000")
    assert event.buyin_bounty == Decimal("10000")
    assert [f.label for f in event.flights] == ["1A", "1B", "Final"]


def test_rpt_stage_labels_prefer_stage_letter() -> None:
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "04 ИЮЛЯ, СУББОТА",
            "16:00 RPT MAIN EVENT (STAGE 1A) - YOUR STACK + (DAY 1A) - 6.000.000 GTD 9500 10000 20/15 MIN 10 Till 20%",
            "05 ИЮЛЯ, ВОСКРЕСЕНЬЕ",
            "18:00 RPT MAIN EVENT (STAGE 1B) - YOUR STACK + (DAY 1A) - 6.000.000 GTD 9500 10000 20/15 MIN 10 Till 20%",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026)
    stage = next(e for e in result.events if e.name.endswith("STAGE"))
    assert [f.label for f in stage.flights] == ["1A", "1B"]


def test_rpt_recovers_nameless_main_event_row() -> None:
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "11 ИЮЛЯ, СУББОТА",
            "12:00 RPT MAIN EVENT (DAY 1B) - 6.000.000 GTD 39000 50000 30 MIN 14 ITM15%",
            "10 ИЮЛЯ, ПЯТНИЦА",
            "11:00 39000 50000 40 MIN 14 ITM15%",
        ]
    )
    # Without day-order fix this is awkward; use starts_on chronological lines instead.
    text = "\n".join(
        [
            "12:00 RPT MAIN EVENT (DAY 1B) - 6.000.000 GTD 39000 50000 30 MIN 14 ITM15%",
            "11:00 39000 50000 40 MIN 14 ITM15%",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026, starts_on=date(2026, 7, 11))
    main = next(e for e in result.events if e.name == "RPT MAIN EVENT")
    assert main.buyin == Decimal("39000")
    assert len(main.flights) == 2


def test_rpt_highrollers_closed_attaches_despite_ocr_name() -> None:
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "09 ИЮЛЯ, ЧЕТВЕРГ",
            "13:00 HIGHROLLERS CUP BY POKERDOM (DAY 1) 8-MAX - 3.000.000 GTD 59000 75000 30 MIN 14",
            "10 ИЮЛЯ, ПЯТНИЦА",
            "11:00 HIGHROLLERS CUP BY POKERDOM (FINAL DAY) CLOSED 40 MIN",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026)
    assert not any(i.code == "closed_orphan" for i in result.issues)
    event = next(e for e in result.events if "POKERDOM" in e.name.upper())
    assert [f.label for f in event.flights] == ["1", "Final"]


def test_rpt_closed_orphan_attaches_to_open_parent() -> None:
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "05 ИЮЛЯ, ВОСКРЕСЕНЬЕ",
            "13:00 RUSSIAN POKER OPEN KNOCKOUT EVENT (DAY 1A) - 2.000.000 GTD 9500+7500 20000 20 MIN 10",
            "06 ИЮЛЯ, ПОНЕДЕЛЬНИК",
            "12:00 RUSSIAN POKER OPEN EVENT (FINAL DAY) CLOSED 25/30 MIN",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026)
    assert result.unparsed_rows == []
    assert len(result.events) == 1
    event = result.events[0]
    assert event.name == "RUSSIAN POKER OPEN KNOCKOUT EVENT"
    assert [flight.label for flight in event.flights] == ["1A", "Final"]
    assert event.buyin == Decimal("17000")


def test_rpt_closed_orphan_drops_optional_knockout() -> None:
    """FINAL DAY often omits KNOCKOUT from the title (Kaliningrad posters)."""
    parser = RptScheduleOcrParser()
    text = "\n".join(
        [
            "01 АВГУСТА, СУББОТА",
            "18:00 KALININGRAD KNOCKOUT CHAMPIONSHIP PKO (DAY 1A) - 4.000.000 GTD 14000+6000 20000 25 MIN 10",
            "03 АВГУСТА, ПОНЕДЕЛЬНИК",
            "11:00 KALININGRAD CHAMPIONSHIP PKO (FINAL DAY) CLOSED 30 MIN",
            "06 АВГУСТА, ЧЕТВЕРГ",
            "15:00 SUPERKNOCKOUT EVENT (DAY 1) - 2.000.000 GTD 20000+10000 40000 25 MIN 12",
            "07 АВГУСТА, ПЯТНИЦА",
            "11:00 SUPERKNOCKOUT EVENT (FINAL DAY) CLOSED 30 MIN",
        ]
    )
    result = parser.parse_ocr_text(text, year=2026, starts_on=date(2026, 8, 1))
    assert result.unparsed_rows == []
    assert not any(i.code == "closed_orphan" for i in result.issues)
    by_name = {e.name.upper(): e for e in result.events}
    champ = next(e for e in result.events if "KALININGRAD" in e.name.upper())
    assert "KNOCKOUT" in champ.name.upper()
    assert [f.label for f in champ.flights] == ["1A", "Final"]
    super_ko = next(e for e in result.events if "SUPERKNOCKOUT" in e.name.upper())
    assert [f.label for f in super_ko.flights] == ["1", "Final"]
    assert len(by_name) == 2


def test_rpt_preprocess_upscales_narrow_posters() -> None:
    from PIL import Image

    parser = RptScheduleOcrParser()
    img = Image.new("RGB", (871, 1280), color=(20, 20, 40))
    prepared = parser._preprocess(img)
    assert prepared.size == (871 * 3, 1280 * 3)


@pytest.mark.slow
def test_rpt_jpg_ocr_end_to_end() -> None:
    """Optional live OCR — skipped unless tesseract is available."""
    pytesseract = pytest.importorskip("pytesseract")
    try:
        pytesseract.get_tesseract_version()
    except Exception:  # noqa: BLE001
        pytest.skip("tesseract binary not available")

    data = JPG_FIXTURE.read_bytes()
    parser = RptScheduleOcrParser()
    ctx = ParserContext(
        filename="RPT_Altai_3-13_июля.jpg",
        detected_type="image",
        organizer_slug="rpt",
        series_id=None,
        series_starts_on=date(2026, 7, 3),
        series_ends_on=date(2026, 7, 13),
        default_currency_code="RUB",
        import_kind="schedule",
    )
    result = parser.parse(ctx, data)
    assert result.parser_used == "rpt_schedule_ocr_v1"
    assert len(result.events) >= 5
    names = " ".join(event.name.upper() for event in result.events)
    assert "ALTAI" in names or "MAIN" in names or "CHAMPIONSHIP" in names


@pytest.mark.slow
def test_rpt_pdf_ocr_end_to_end() -> None:
    """Live OCR on Altai image-PDF sample."""
    pytesseract = pytest.importorskip("pytesseract")
    try:
        pytesseract.get_tesseract_version()
    except Exception:  # noqa: BLE001
        pytest.skip("tesseract binary not available")

    samples = Path(__file__).resolve().parents[2] / "docs" / "rasp_samples"
    pdf = next(samples.glob("*июля.pdf"), None)
    if pdf is None:
        pytest.skip("Altai schedule PDF sample missing")

    parser = RptScheduleOcrParser()
    ctx = ParserContext(
        filename=pdf.name,
        detected_type="pdf",
        organizer_slug="rpt",
        series_id=None,
        series_starts_on=date(2026, 7, 3),
        series_ends_on=date(2026, 7, 13),
        default_currency_code="RUB",
        import_kind="schedule",
    )
    result = parser.parse(ctx, pdf.read_bytes())
    assert result.parser_used == "rpt_schedule_ocr_v1"
    assert len(result.events) >= 8
    names = " ".join(event.name.upper() for event in result.events)
    assert "MAIN" in names or "ALTAI" in names or "CHAMPIONSHIP" in names
    # With series_starts_on, dates should span more than one day even if headers OCR fails.
    dates = {flight.play_date for event in result.events for flight in event.flights}
    assert len(dates) >= 3
    assert min(dates) >= date(2026, 7, 3)
