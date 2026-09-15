from app.core.rate_limit import BAN_SECONDS, SWEEP_DAYS, WINDOW_SECONDS, RateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_window_limit_then_ban_after_three_strikes() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)

    assert [limiter.hit("ip:1", limit=3) for _ in range(3)] == [None, None, None]
    first = limiter.hit("ip:1", limit=3)
    assert first is not None and 0 < first <= WINDOW_SECONDS + 1

    # Другие не страдают.
    assert limiter.hit("ip:2", limit=3) is None

    limiter.hit("ip:1", limit=3)
    assert limiter.hit("ip:1", limit=3) == BAN_SECONDS

    clock.now += WINDOW_SECONDS + 1
    banned = limiter.hit("ip:1", limit=3)
    assert banned is not None and banned > WINDOW_SECONDS

    clock.now += BAN_SECONDS
    assert limiter.hit("ip:1", limit=3) is None


def test_window_slides() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    for _ in range(3):
        assert limiter.hit("user:a", limit=3) is None
    clock.now += WINDOW_SECONDS + 1
    assert limiter.hit("user:a", limit=3) is None


def test_date_sweep_is_caught() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    results = [limiter.hit("user:a", limit=1000, day=f"2026-10-{day:02d}") for day in range(1, 23)]
    assert all(result is None for result in results[:SWEEP_DAYS])
    assert results[SWEEP_DAYS] is not None
    # Обычный игрок ходит от «сегодня» — одна дата, никаких претензий.
    assert all(limiter.hit("user:b", limit=1000, day="2026-09-15") is None for _ in range(50))
