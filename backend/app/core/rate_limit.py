"""Частота запросов к данным расписания — защита базы от выкачивания (решение Ивана 15.09).

Бэкенд работает одним процессом uvicorn, поэтому счётчики живут в памяти: перезапуск их
обнуляет, и это нормально — задача отсечь скрипт или ИИ-агента, а не вести учёт.

- гость считается по IP, игрок — по аккаунту; у игрока лимит выше;
- превысил лимит окна — 429 с `retry_after`; три превышения за час — бан на час;
- игрок, за час запросивший расписание от 20+ разных дат, перебирает базу, а не играет.
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request

from app.core.deps import get_optional_user
from app.core.exceptions import RateLimitError
from app.models.auth import User

WINDOW_SECONDS = 300
GUEST_LIMIT = 60
USER_LIMIT = 240
STRIKES_TO_BAN = 3
STRIKE_WINDOW_SECONDS = 3600
BAN_SECONDS = 3600
SWEEP_DAYS = 20
_MAX_TRACKS = 50_000
# ASGI-клиент тестов ходит на http://test: лимиты там включаются только заголовком.
_TEST_HOSTS = frozenset({"test", "testserver"})


@dataclass
class _Track:
    hits: deque[float] = field(default_factory=deque)
    strikes: deque[float] = field(default_factory=deque)
    days: dict[str, float] = field(default_factory=dict)
    banned_until: float = 0.0


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._tracks: dict[str, _Track] = {}

    def reset(self) -> None:
        self._tracks.clear()

    def _track(self, key: str, now: float) -> _Track:
        if key not in self._tracks and len(self._tracks) >= _MAX_TRACKS:
            stale = [
                name
                for name, track in self._tracks.items()
                if track.banned_until < now
                and (not track.hits or now - track.hits[-1] > STRIKE_WINDOW_SECONDS)
            ]
            for name in stale:
                del self._tracks[name]
        return self._tracks.setdefault(key, _Track())

    def _strike(self, track: _Track, now: float) -> int | None:
        """Засчитать нарушение; вернуть длину бана, если это третье за час."""
        track.strikes.append(now)
        while track.strikes and now - track.strikes[0] > STRIKE_WINDOW_SECONDS:
            track.strikes.popleft()
        if len(track.strikes) >= STRIKES_TO_BAN:
            track.strikes.clear()
            track.banned_until = now + BAN_SECONDS
            return BAN_SECONDS
        return None

    def hit(self, key: str, *, limit: int, day: str | None = None) -> int | None:
        """Учесть запрос. None — пропустить; число — через сколько секунд можно повторить."""
        now = self._clock()
        track = self._track(key, now)
        if track.banned_until > now:
            return int(track.banned_until - now) + 1

        while track.hits and now - track.hits[0] > WINDOW_SECONDS:
            track.hits.popleft()

        if day:
            track.days = {
                name: at for name, at in track.days.items() if now - at <= STRIKE_WINDOW_SECONDS
            }
            track.days[day] = now
            if len(track.days) > SWEEP_DAYS:
                track.days.clear()
                return self._strike(track, now) or WINDOW_SECONDS

        if len(track.hits) >= limit:
            return self._strike(track, now) or int(WINDOW_SECONDS - (now - track.hits[0])) + 1
        track.hits.append(now)
        return None


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client is not None else "unknown"


async def guard_schedule(
    request: Request,
    user: Annotated[User | None, Depends(get_optional_user)],
) -> User | None:
    """Кто смотрит расписание (None — гость) — после проверки частоты запросов."""
    if (
        request.headers.get("host") in _TEST_HOSTS
        and request.headers.get("x-rate-limit-test") != "1"
    ):
        return user
    if user is None:
        retry = limiter.hit(f"ip:{client_ip(request)}", limit=GUEST_LIMIT)
    else:
        retry = limiter.hit(
            f"user:{user.id}",
            limit=USER_LIMIT,
            day=request.query_params.get("from", "")[:10] or None,
        )
    if retry is not None:
        raise RateLimitError("Слишком много запросов", retry_after=retry)
    return user


ScheduleViewer = Annotated[User | None, Depends(guard_schedule)]
