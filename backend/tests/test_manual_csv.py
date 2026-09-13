from datetime import time
from decimal import Decimal
from pathlib import Path

import pytest

from app.models.enums import BountyKind, GameType
from app.services.tournaments.manual_csv import (
    ManualCsvError,
    looks_like_manual_csv,
    parse_days,
    parse_manual_csv,
)

POKER21 = (Path(__file__).parent / "fixtures" / "poker21-2026-09-14.csv").read_bytes()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("пн", [1]),
        ("ср, пт", [3, 5]),
        ("Суббота", [6]),
        ("ежедневно", [1, 2, 3, 4, 5, 6, 7]),
        ("будни", [1, 2, 3, 4, 5]),
        ("выходные", [6, 7]),
        ("когда-нибудь", None),
        ("", None),
    ],
)
def test_parse_days(raw: str, expected: list[int] | None) -> None:
    assert parse_days(raw) == expected


def test_poker21_week() -> None:
    result = parse_manual_csv(POKER21)
    assert result.issues == []
    assert result.rows_total == 20

    # «Турнир дня MKO» по 18:00 — три разных бай-ина, значит три шаблона.
    mko = [t for t in result.templates if t.name == "Турнир дня MKO"]
    assert {(tuple(t.weekdays), t.buyin) for t in mko} == {
        ((1,), Decimal("500")),
        ((3,), Decimal("1000")),
        ((4,), Decimal("300")),
    }
    assert all(t.bounty_kind is BountyKind.MYSTERY for t in mko)

    (big_boss,) = [t for t in result.templates if t.name == "Big Boss PKO"]
    assert (big_boss.weekdays, big_boss.start_time, big_boss.guarantee) == (
        [6],
        time(18, 0),
        Decimal("250000"),
    )
    assert big_boss.satellite_target is None
    (satellite,) = [t for t in result.templates if t.name == "Sat Big Boss PKO"]
    assert satellite.ticket_value == Decimal("5000")
    assert satellite.satellite_target == "Big Boss PKO"
    assert satellite.weekdays == [1, 2, 3, 4, 5, 6, 7]

    (plo6,) = [t for t in result.templates if t.name == "PLO 6"]
    assert plo6.game_type is GameType.OTHER

    # Стартов в неделю: 7 турниров дня + 8×7 ежедневных + 4×7 сателлитов + Super Sat.
    assert sum(len(t.weekdays) for t in result.templates) == 7 + 56 + 28 + 1


def test_same_tournament_on_several_rows_merges_days() -> None:
    data = "\n".join(
        [
            "days,time,name,buyin,guarantee",
            "ср,18:00,DEEP,500,30000",
            "сб,18:00,DEEP,500,30000",
            "вс,18:00,DEEP,500,40000",
        ]
    ).encode()
    result = parse_manual_csv(data)
    assert sorted(t.weekdays for t in result.templates) == [[3, 6], [7]]


def test_satellite_target_from_name_when_no_column() -> None:
    data = "days,time,name,buyin,ticket\nпн,18:00,MAIN SAT,2,16\n".encode()
    (template,) = parse_manual_csv(data).templates
    assert template.satellite_target == "MAIN"


def test_issues_do_not_stop_the_rest() -> None:
    data = "\n".join(
        [
            "days,time,name,buyin,bounty",
            "пн,18:00,OK,100,",
            "когда,18:00,BAD DAYS,100,",
            "пн,25:00,BAD TIME,100,",
            "пн,19:00,BAD BOUNTY,100,xyz",
        ]
    ).encode()
    result = parse_manual_csv(data)
    assert [t.name for t in result.templates] == ["OK"]
    assert len(result.issues) == 3


def test_detection() -> None:
    assert looks_like_manual_csv(POKER21)
    assert not looks_like_manual_csv(b",MONDAY,,\n,-5,-3,UTC\n")
    with pytest.raises(ManualCsvError):
        parse_manual_csv(b"a,b\n1,2\n")
