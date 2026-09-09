"""Unit tests for PDF schedule helpers."""

from datetime import date
from decimal import Decimal

import pytest

from app.models.schedule import BlindLevel
from app.services.pdf.filename import pdf_filename, translit_slug
from app.services.pdf.highlight import (
    classify_highlight,
    format_buyin_display,
    format_level_duration,
    format_money_plain,
    is_closed_event,
)


@pytest.mark.unit
def test_format_buyin_total_minus_bounty() -> None:
    assert (
        format_buyin_display(
            buyin=Decimal("20000"),
            buyin_bounty=Decimal("6000"),
            closed=False,
        )
        == "14\u00a0000+6\u00a0000"
    )


@pytest.mark.unit
def test_format_buyin_plain_and_closed() -> None:
    assert format_buyin_display(buyin=Decimal("11000"), buyin_bounty=None, closed=False) == (
        "11\u00a0000"
    )
    assert format_buyin_display(buyin=Decimal("0"), buyin_bounty=None, closed=True) == "closed"


@pytest.mark.unit
def test_highlight_rules() -> None:
    assert (
        classify_highlight(
            name="RPT MAIN EVENT",
            buyin=Decimal("44000"),
            guarantee=Decimal("8000000"),
            tags=["main"],
        )
        == "main"
    )
    assert (
        classify_highlight(
            name="Kaliningrad Championship",
            buyin=Decimal("20000"),
            guarantee=Decimal("4000000"),
            tags=["bounty"],
        )
        == "champ"
    )
    assert (
        classify_highlight(
            name="Satellite to ME",
            buyin=Decimal("3000"),
            guarantee=None,
            tags=["satellite"],
        )
        == "sat"
    )
    assert (
        classify_highlight(
            name="Event (Final Day)",
            buyin=Decimal("0"),
            guarantee=None,
            tags=[],
        )
        == "closed"
    )
    assert (
        classify_highlight(
            name='Бесплатный турнир "Welcome to Kaliningrad"',
            buyin=Decimal("0"),
            guarantee=Decimal("1000000"),
            tags=[],
            flight_label="Day 1A",
        )
        == "champ"
    )
    assert (
        classify_highlight(
            name='Бесплатный турнир "Welcome to Kaliningrad"',
            buyin=Decimal("0"),
            guarantee=Decimal("1000000"),
            tags=[],
            flight_label="Day 2",
        )
        == "closed"
    )


@pytest.mark.unit
def test_closed_heuristic() -> None:
    assert is_closed_event(name="X Final Day")
    assert is_closed_event(name="Championship", flight_label="Day 2")
    assert is_closed_event(name="Championship", flight_label="Final Day")
    assert not is_closed_event(name="Regular")
    assert not is_closed_event(name='Бесплатный турнир "Welcome"', flight_label="Day 1A")
    assert not is_closed_event(name="Freeroll sat")


@pytest.mark.unit
def test_level_duration() -> None:
    levels = [
        BlindLevel(level_no=1, minutes=20, is_break=False, structure_set_label="default"),
        BlindLevel(level_no=2, minutes=20, is_break=False, structure_set_label="default"),
        BlindLevel(level_no=3, minutes=15, is_break=False, structure_set_label="default"),
        BlindLevel(level_no=4, minutes=15, is_break=True, structure_set_label="default"),
    ]
    assert format_level_duration(levels) == "20/15 мин"
    assert format_level_duration([]) is None


@pytest.mark.unit
def test_pdf_filename() -> None:
    name = pdf_filename(
        organizer_slug="rpt",
        series_name="Russian Poker Tour Калининград",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 11),
    )
    assert name.startswith("Day2_rpt_")
    assert name.endswith("2026-08.pdf")
    assert " " not in name
    assert translit_slug("Калининград") == "kaliningrad"


@pytest.mark.unit
def test_pdf_filename_strips_dates_from_series_name() -> None:
    from app.services.pdf.filename import strip_dates_from_series_name

    assert "августа" not in strip_dates_from_series_name("RPF 17–30 августа").lower()
    assert "17" not in strip_dates_from_series_name("RPF 17–30 августа")

    name = pdf_filename(
        organizer_slug="rpf",
        series_name="RPF 17–30 августа",
        starts_on=date(2026, 8, 17),
        ends_on=date(2026, 8, 30),
    )
    assert name == "Day2_rpf_2026-08.pdf"
    assert "17-30" not in name
    assert "avgusta" not in name.lower()
    assert len(name) <= 80


@pytest.mark.unit
def test_format_money_plain() -> None:
    assert format_money_plain(Decimal("4000000")) == "4\u00a0000\u00a0000"
