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
    assert result.rows_total == 23

    # «Турнир дня MKO» по 18:00 — три разных бай-ина, значит три шаблона.
    mko = [t for t in result.templates if t.name == "Турнир дня MKO"]
    assert {(tuple(t.weekdays), t.buyin) for t in mko} == {
        ((1,), Decimal("500")),
        ((3,), Decimal("1000")),
        ((4,), Decimal("300")),
    }
    assert all(t.bounty_kind is BountyKind.MYSTERY for t in mko)

    # Одинаковый «21 очко Rebuy» в среду и субботу схлопывается в один шаблон.
    (twenty_one,) = [t for t in result.templates if t.name == "21 очко Rebuy"]
    assert twenty_one.weekdays == [3, 6]
    assert twenty_one.game_type is GameType.OTHER

    (big_boss,) = [t for t in result.templates if t.name == "Big Boss PKO"]
    assert (big_boss.weekdays, big_boss.start_time, big_boss.guarantee) == (
        [6],
        time(18, 0),
        Decimal("250000"),
    )
    (satellite,) = [t for t in result.templates if t.name == "Сателлит на Big Boss"]
    assert satellite.ticket_value == Decimal("5000")
    assert satellite.weekdays == [1, 2, 3, 4, 5, 6, 7]

    # Всего стартов в неделю: 9 турниров дня + 8×7 ежедневных + 5×7 сателлитов + Super Sat.
    assert sum(len(t.weekdays) for t in result.templates) == 9 + 56 + 35 + 1


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
