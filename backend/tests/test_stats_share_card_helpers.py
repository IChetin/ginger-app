"""Unit tests for share-card formatting helpers (no DB)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services.pdf.stats_share_card import (
    MINUS,
    NBSP,
    build_chart_paths,
    format_money_signed,
    format_percent_plain,
    format_percent_signed,
    format_period_label,
    hero_font_size,
    share_card_filename,
)


def test_format_money_signed() -> None:
    assert format_money_signed(Decimal("214000"), "₽") == f"+214{NBSP}000{NBSP}₽"
    assert format_money_signed(Decimal("-48300"), "₽") == f"{MINUS}48{NBSP}300{NBSP}₽"
    assert format_money_signed(Decimal("0"), "₽") == f"0{NBSP}₽"
    assert format_money_signed(Decimal("0.00"), "₽") == f"0{NBSP}₽"


def test_format_percent() -> None:
    assert format_percent_signed(Decimal("192.8")) == f"+192,8{NBSP}%"
    assert format_percent_signed(Decimal("-52.5")) == f"{MINUS}52,5{NBSP}%"
    assert format_percent_signed(Decimal("0")) == f"0,0{NBSP}%"
    assert format_percent_plain(Decimal("33.3")) == f"33,3{NBSP}%"
    assert format_percent_signed(None) == "—"


def test_format_period_label() -> None:
    assert format_period_label(None, None) == "Всё время"
    assert format_period_label(date(2026, 7, 1), date(2026, 7, 30)) == "Июль 2026"
    assert (
        format_period_label(date(2026, 1, 1), date(2026, 7, 30)) == "Январь — июль 2026"
    )


def test_share_card_filename() -> None:
    assert share_card_filename(None, None) == "Day2_stats_all.png"
    assert share_card_filename(date(2026, 7, 1), date(2026, 7, 30)) == "Day2_stats_2026-07.png"
    assert share_card_filename(date(2026, 1, 1), date(2026, 7, 30)) == "Day2_stats_2026.png"


def test_hero_font_size_shrinks() -> None:
    assert hero_font_size("+214 000 ₽") == 60
    assert hero_font_size("+12 345 678 ₽") < 60


def test_build_chart_single_point() -> None:
    chart = build_chart_paths([100.0])
    assert "M0 " in str(chart["line_d"])
    assert chart["end_x"] == 552
    assert chart["fill_d"]


def test_build_chart_negative_fill_to_zero() -> None:
    chart = build_chart_paths([-10.0, -40.0, -80.0])
    fill = str(chart["fill_d"])
    assert fill.endswith("Z")
    assert chart["zero_y"] < chart["end_y"]
