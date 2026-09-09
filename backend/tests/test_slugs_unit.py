"""Unit tests for slugify and series/event slug builders."""

from __future__ import annotations

from datetime import date

import pytest

from app.services.slugs import build_event_slug_base, build_series_slug_base
from app.utils.slugify import looks_like_uuid, slugify, with_unique_suffix


@pytest.mark.unit
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Калининград", "kaliningrad"),
        ("Сочи", "sochi"),
        ("Минск", "minsk"),
        ("Кирения", "kireniya"),
        ("Красная Поляна", "krasnaya-polyana"),
        ("Сибирская Монета", "sibirskaya-moneta"),
    ],
)
def test_translit_cities(raw: str, expected: str) -> None:
    assert slugify(raw) == expected


@pytest.mark.unit
def test_series_slug_formula() -> None:
    assert (
        build_series_slug_base(
            organizer_slug="rpt",
            city="Калининград",
            starts_on=date(2026, 8, 17),
        )
        == "rpt-kaliningrad-2026-08"
    )


@pytest.mark.unit
def test_event_slug_with_and_without_number() -> None:
    assert build_event_slug_base(number=5, name="Main Event") == "5-main-event"
    assert build_event_slug_base(number=None, name="Main Event") == "main-event"


@pytest.mark.unit
def test_unique_suffix() -> None:
    taken: set[str] = set()
    assert with_unique_suffix("rpt-sochi-2026-08", taken, max_len=80) == "rpt-sochi-2026-08"
    assert with_unique_suffix("rpt-sochi-2026-08", taken, max_len=80) == "rpt-sochi-2026-08-2"
    assert with_unique_suffix("rpt-sochi-2026-08", taken, max_len=80) == "rpt-sochi-2026-08-3"


@pytest.mark.unit
def test_looks_like_uuid() -> None:
    assert looks_like_uuid("30000000-0000-4000-8000-000000000002")
    assert not looks_like_uuid("rpt-kaliningrad-2026-08")
