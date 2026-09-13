import pytest

from app.services.tournaments.satellites import satellite_target


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ('Satellite to "Main Bounty 10k', "Main Bounty 10k"),
        ("Supersatellite to Main Event", "Main Event"),
        ("STAGE TO RPT MAIN EVENT", "RPT MAIN EVENT"),
        ("Night Satellite to Kaliningrad Cup", "Kaliningrad Cup"),
        ("Сателлит на Big Boss", "Big Boss"),
        ("MAIN SAT (Stack!)", "MAIN (Stack!)"),
        ("Last Chance MAIN SAT", "Last Chance MAIN"),
        ("Icon PKO SAT", "Icon PKO"),
        ("SUPER SAT", None),
        ("MEGA SAT", None),
        ("DREAM RIVER", None),
        ("SATURDAY SPECIAL", None),
        ("Sat ProSto HR", "ProSto HR"),
        ("FREE Sat MAIN", "MAIN"),
        ("Sat", None),
        ("MAIN SAT", "MAIN"),
    ],
)
def test_satellite_target(name: str, expected: str | None) -> None:
    assert satellite_target(name) == expected
