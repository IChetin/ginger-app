from datetime import date, time
from decimal import Decimal
from pathlib import Path

import pytest

from app.models.enums import BountyKind, GameType
from app.schemas.tournaments import TemplateDraft
from app.services.tournaments.prosto_sheet import (
    ProstoSheetError,
    clean_name,
    looks_like_prosto_sheet,
    parse_chips,
    parse_prosto_sheet,
)

FIXTURE = (Path(__file__).parent / "fixtures" / "prosto-private-g-2026-09-13.csv").read_bytes()
TODAY = date(2026, 9, 13)


@pytest.fixture(scope="module")
def templates() -> list[TemplateDraft]:
    result = parse_prosto_sheet(FIXTURE, today=TODAY)
    # Единственная проблемная строка листа — турнир без бай-ина.
    assert [issue.message for issue in result.issues] == ["PEOPLE'S Cup: не разобран бай-ин"]
    return result.templates


def _one(
    templates: list[TemplateDraft], name: str, start: time, **filters: object
) -> TemplateDraft:
    found = [
        item
        for item in templates
        if item.name == name
        and item.start_time == start
        and all(getattr(item, key) == value for key, value in filters.items())
    ]
    assert len(found) == 1, found
    return found[0]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("250pp", Decimal("250")),
        ("18РР", Decimal("18")),
        ("300pр ", Decimal("300")),
        ("1000рр", Decimal("1000")),
        ("0pp/15pp", Decimal("0")),
        ("1 билет", None),
        ("iPhone 17pro", None),
        ("-", None),
    ],
)
def test_parse_chips(raw: str, expected: Decimal | None) -> None:
    assert parse_chips(raw) == expected


def test_clean_name() -> None:
    assert clean_name("🎟️ Sat ⭐️ProSto HR") == "Sat ProSto HR"
    assert clean_name("🔺BIG PKO 1/2 Buy-in") == "BIG PKO 1/2 Buy-in"


def test_weekly_grid(templates: list[TemplateDraft]) -> None:
    pko = _one(templates, "PKO 1/2 Buy-in", time(18, 0), valid_from=None)
    assert pko.weekdays == [1]
    assert (pko.buyin, pko.guarantee, pko.bounty_kind) == (
        Decimal("18"),
        Decimal("250"),
        BountyKind.PKO,
    )
    assert (pko.late_reg_levels, pko.level_minutes, pko.start_stack) == (9, "10/8/.7", 12000)

    light = _one(templates, "LIGHT ReBuy", time(19, 0))
    assert light.early_bird_players == 8
    assert (light.rebuy_terms, light.addon_terms) == ("1,2", "2,5")

    plo = _one(templates, "PLO5 PKO", time(19, 0))
    assert (plo.game_type, plo.bounty_kind) == (GameType.PLO5, BountyKind.PKO)

    hr = _one(templates, "ProSto HR ReEntry", time(20, 0))
    assert (hr.weekdays, hr.buyin, hr.guarantee, hr.structure) == (
        [6],
        Decimal("75"),
        Decimal("1500"),
        "Deepstack",
    )
    # Одинаковый турнир в разные дни — один шаблон.
    assert _one(templates, "NO Addon", time(20, 0), level_minutes="10").weekdays == [1, 2, 3, 4]


def test_satellites(templates: list[TemplateDraft]) -> None:
    sat = _one(templates, "Sat ProSto HR", time(17, 0))
    assert sat.weekdays == [2, 4]
    assert sat.satellite_target == "ProSto HR"
    assert sat.guarantee is None
    assert sat.notes == "Гарантия: 1 билет"
    # Номинала в листе нет — берётся бай-ин цели «ProSto HR ReEntry».
    assert sat.ticket_value == Decimal("75")
    assert _one(templates, "Sat BIG PKO", time(17, 0)).ticket_value == Decimal("40")
    assert _one(templates, "FREE Sat MAIN", time(13, 0)).satellite_target == "MAIN"


def test_series_dates(templates: list[TemplateDraft]) -> None:
    main = _one(templates, "MAIN EVENT 1A", time(20, 0))
    assert (main.valid_from, main.valid_until, main.weekdays) == (
        date(2026, 9, 16),
        date(2026, 9, 16),
        [3],
    )
    assert (main.buyin, main.guarantee) == (Decimal("50"), Decimal("10000"))
    names = {item.name for item in templates}
    # Прошедшие дни серии и финалы без регистрации (бай-ин «-») не попадают.
    assert "START AUTUMN Series" not in names
    assert "High Rollers Final" not in names
    assert "OPENER Final" not in names
    # Сегодняшний день серии — попадает.
    assert _one(templates, "BIG Autumn NIGHT", time(22, 0)).valid_from == TODAY


def test_detection() -> None:
    assert looks_like_prosto_sheet(FIXTURE)
    assert not looks_like_prosto_sheet(b"days,time,name,buyin\n")
    with pytest.raises(ProstoSheetError):
        parse_prosto_sheet(b"a,b\n1,2\n")
