import pytest

from app.services.tournaments.late_reg import first_level_minutes, late_reg_close_offset


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("15/12/12", 15),
        ("12/10", 12),
        ("8", 8),
        (" 6/5/5 ", 6),
        ("", None),
        (None, None),
        ("турбо", None),
        ("0/5", None),
    ],
)
def test_first_level_minutes(raw: str | None, expected: int | None) -> None:
    assert first_level_minutes(raw) == expected


def test_example_from_spec() -> None:
    # ТЗ §8а.3.1: старт 18:00, «15/12/12», 10 уровней → 150 минут игры + 2 перерыва = 20:40.
    assert late_reg_close_offset(0, 10, "15/12/12") == 160


def test_start_not_on_the_hour_has_short_first_block() -> None:
    # 18:30: 25 игры до 18:55, перерыв, 55, перерыв, 55, перерыв, 15 → 165 минут, 21:15.
    assert late_reg_close_offset(30, 10, "15/12/12") == 165


def test_start_inside_break_waits_for_the_hour() -> None:
    # 21:59 (у Black Sea бывает): до 22:00 перерыв, 55 игры, перерыв, 5 → 66 минут.
    assert late_reg_close_offset(59, 5, "12") == 66


def test_ends_exactly_at_break() -> None:
    assert late_reg_close_offset(0, 11, "5/3/3") == 55


def test_missing_data_returns_none() -> None:
    assert late_reg_close_offset(0, 10, None) is None
    assert late_reg_close_offset(0, 0, "12") is None


def test_rejects_invalid_minute() -> None:
    with pytest.raises(ValueError):
        late_reg_close_offset(60, 10, "12")
