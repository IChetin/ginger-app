"""Момент закрытия поздней регистрации (ТЗ §8а.3.1).

Аддон, где он есть, совпадает с закрытием поздней регистрации, поэтому величина одна.

    чистое_время = уровней_поздней_регистрации × первое_число_из_Minutes
    идём по календарю от старта: в каждом часе 55 минут игры, затем перерыв 5 минут
    накапливаем игровое время, пока не наберётся чистое_время

Считаем проходом по календарю, а не формулой: при старте не в :00 (у Black Sea бывает 21:59)
первый игровой блок короче, и формула `floor((t − 1) / 55)` ломается.
"""

from __future__ import annotations

import re

MINUTES_IN_HOUR = 60
# Перерыв 5 минут в конце каждого часа — везде одинаково (подтверждено Иваном 2026-09-10).
DEFAULT_BREAK_MINUTES = 5

_FIRST_NUMBER = re.compile(r"^\s*(\d{1,3})")


def first_level_minutes(level_minutes: str | None) -> int | None:
    """«15/12/12» → 15, «8» → 8. Для расчёта нужно только первое число — уровни поздней
    регистрации идут до «далее» и «финального стола»."""
    if not level_minutes:
        return None
    match = _FIRST_NUMBER.match(level_minutes)
    if match is None:
        return None
    value = int(match.group(1))
    return value or None


def late_reg_close_offset(
    start_minute_of_hour: int,
    late_reg_levels: int,
    level_minutes: str | None,
    *,
    break_minutes: int = DEFAULT_BREAK_MINUTES,
) -> int | None:
    """Минуты от старта до закрытия поздней регистрации, с учётом часовых перерывов.

    Перерыв — окно [:55, :00) каждого часа по часам. Если старт попал в окно перерыва,
    игра начинается с ближайшего :00. Возвращает None, если данных не хватает.
    """
    per_level = first_level_minutes(level_minutes)
    if per_level is None or late_reg_levels <= 0:
        return None
    if not 0 <= start_minute_of_hour < MINUTES_IN_HOUR:
        raise ValueError("start_minute_of_hour must be in 0..59")

    play_until = MINUTES_IN_HOUR - break_minutes
    remaining = late_reg_levels * per_level
    elapsed = 0
    minute = start_minute_of_hour
    while True:
        if minute >= play_until:
            elapsed += MINUTES_IN_HOUR - minute
            minute = 0
            continue
        block = play_until - minute
        if remaining <= block:
            return elapsed + remaining
        remaining -= block
        elapsed += block
        minute = play_until
