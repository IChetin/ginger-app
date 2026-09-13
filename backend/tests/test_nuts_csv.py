from datetime import time
from decimal import Decimal
from pathlib import Path

import pytest

from app.models.enums import BountyKind, GameType
from app.schemas.tournaments import TemplateDraft
from app.services.tournaments.nuts_csv import (
    NutsCsvError,
    classify_game,
    normalize_name,
    parse_nuts_csv,
)

FIXTURE = Path(__file__).parent / "fixtures" / "nuts-2026-09-07.csv"


@pytest.fixture(scope="module")
def templates() -> list[TemplateDraft]:
    result = parse_nuts_csv(FIXTURE.read_bytes())
    assert result.issues == []
    assert result.rows_total == 371
    return result.templates


def _find(templates: list[TemplateDraft], name: str, start: time) -> list[TemplateDraft]:
    return [item for item in templates if item.name == name and item.start_time == start]


def test_every_row_lands_in_exactly_one_template(templates: list[TemplateDraft]) -> None:
    assert sum(len(item.weekdays) for item in templates) == 371
    # 174 пары «название + время» (без нормализации пробелов вышло бы 175: «MAIN  SAT» и
    # «MAIN SAT» — один турнир). Часть пар различается по дням — отсюда больше шаблонов.
    assert len({(item.name, item.start_time) for item in templates}) == 174
    assert len(templates) > 175


def test_weekend_guarantee_splits_template(templates: list[TemplateDraft]) -> None:
    dream_river = _find(templates, "DREAM RIVER", time(9, 0))
    by_days = {tuple(item.weekdays): item.guarantee for item in dream_river}
    assert by_days == {(1, 2, 3, 4, 5): Decimal("5000"), (6, 7): Decimal("4800")}


def test_day_boundary_is_minus5_column(templates: list[TemplateDraft]) -> None:
    # Последняя строка понедельника: 22:00 по «-5» = 06:00 МСК вторника.
    knightly = _find(templates, "KNIGHTLY PKO", time(6, 0))
    assert knightly
    assert 2 in {day for item in knightly for day in item.weekdays}
    # Воскресенье 21:00 по «-5» = 05:00 МСК понедельника.
    turbo = _find(templates, "KNIGHTLY TURBO PKO", time(5, 0))
    assert [item.weekdays for item in turbo] == [[1]]


def test_names_are_normalized(templates: list[TemplateDraft]) -> None:
    # «  CRAZY» в четверг — тот же турнир, что «CRAZY» в остальные дни.
    crazy = _find(templates, "CRAZY", time(15, 0))
    assert 4 in {day for item in crazy for day in item.weekdays}
    assert all("  " not in item.name and item.name == item.name.strip() for item in templates)


def test_fields_and_late_reg(templates: list[TemplateDraft]) -> None:
    (weekday_river,) = [
        item for item in _find(templates, "DREAM RIVER", time(9, 0)) if 1 in item.weekdays
    ]
    assert weekday_river.buyin == Decimal("20")
    assert weekday_river.addon_cost == Decimal("20")
    assert weekday_river.addon_terms == "3x"
    assert weekday_river.start_stack == 100000
    assert weekday_river.table_size == 8
    assert weekday_river.late_reg_levels == 14
    assert weekday_river.level_minutes == "12/10/10"
    assert weekday_river.structure == "Deepstack"
    assert weekday_river.early_bird_players == 10
    assert weekday_river.notes is None
    assert weekday_river.satellite_target is None
    (main_sat,) = {t.satellite_target for t in templates if t.name == "MAIN SAT (Stack!)"}
    assert main_sat == "MAIN (Stack!)"
    # 14 × 12 = 168 минут игры от 09:00: 55+5+55+5+55+5+3 = 183.
    assert weekday_river.late_reg_close_offset_min == 183


def test_decimal_comma_buyins(templates: list[TemplateDraft]) -> None:
    assert Decimal("1.6") in {item.buyin for item in templates}
    assert Decimal("0.8") in {item.buyin for item in templates}


@pytest.mark.parametrize(
    ("game", "name", "expected"),
    [
        ("NLH", "MAIN SAT", (GameType.NLH, BountyKind.NONE)),
        ("NLH PKO", "FAST PKO", (GameType.NLH, BountyKind.PKO)),
        ("PKO", "HIGH PKO", (GameType.NLH, BountyKind.PKO)),
        ("PLO5  PKO", "PLO5 PKO", (GameType.PLO5, BountyKind.PKO)),
        ("PLO4 PKO", "OMAHA", (GameType.PLO, BountyKind.PKO)),
        ("NLH KO", "KO", (GameType.NLH, BountyKind.KO)),
        ("NLH MKO", "MKO", (GameType.NLH, BountyKind.MYSTERY)),
        ("NLH", "MYSTERY KNIGHT", (GameType.NLH, BountyKind.MYSTERY)),
        ("NLH 6+", "SHORT", (GameType.OTHER, BountyKind.NONE)),
    ],
)
def test_classify_game(game: str, name: str, expected: tuple[GameType, BountyKind]) -> None:
    assert classify_game(game, name) == expected


def test_normalize_name() -> None:
    assert normalize_name("  Last Chance MAIN  SAT ") == "Last Chance MAIN SAT"


def test_not_a_nuts_sheet() -> None:
    with pytest.raises(NutsCsvError):
        parse_nuts_csv(b"a,b,c\n1,2,3\n")
