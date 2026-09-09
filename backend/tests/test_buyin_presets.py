"""Unit tests for buy-in preset matching."""

from decimal import Decimal

from app.services.buyin_presets import amount_matches_presets, parse_buyin_presets


def test_parse_buyin_presets_csv_and_list() -> None:
    assert parse_buyin_presets("lt10k,10-50k,bogus") == ["lt10k", "10-50k"]
    assert parse_buyin_presets(["gte50k", "gte50k"]) == ["gte50k"]
    assert parse_buyin_presets(None) == []


def test_amount_matches_presets_buckets() -> None:
    assert amount_matches_presets(Decimal("9999.99"), ["lt10k"])
    assert not amount_matches_presets(Decimal("10000"), ["lt10k"])
    assert amount_matches_presets(Decimal("10000"), ["10-50k"])
    assert amount_matches_presets(Decimal("49999.99"), ["10-50k"])
    assert not amount_matches_presets(Decimal("50000"), ["10-50k"])
    assert amount_matches_presets(Decimal("50000"), ["gte50k"])
    assert amount_matches_presets(Decimal("25000"), ["lt10k", "10-50k"])
