"""Цель сателлита из названия турнира — чтобы показывать «Sat → Main Event».

Встречающиеся формы:

    Satellite to "Main Bounty 10k       (Day2, RPT)
    Supersatellite to Main Event
    STAGE TO RPT MAIN EVENT
    Сателлит на Big Boss
    MAIN SAT (Stack!)                   (NUTS: «X SAT» = сателлит на X)
    Last Chance MAIN SAT

Название без цели («SUPER SAT», «MEGA SAT») — сателлит, но цель неизвестна: None.
"""

from __future__ import annotations

import re

_TO_TARGET = re.compile(
    r"^.*?\b\w*(?:satellite|sat|stage|сателлит)\s+(?:to|на)\s+(?P<target>.+)$",
    re.IGNORECASE,
)
_TRAILING_SAT = re.compile(r"^(?P<head>.+?)\s+sat\b(?P<tail>.*)$", re.IGNORECASE)
# Слова, которые описывают сам сателлит, а не турнир, на который он ведёт.
_MODIFIERS = {"super", "mega", "mini", "night", "last", "chance", "big", "daily", "turbo"}


def _clean(value: str) -> str | None:
    cleaned = " ".join(value.strip().strip('"«»').split())
    return cleaned or None


def satellite_target(name: str) -> str | None:
    match = _TO_TARGET.match(name)
    if match:
        return _clean(match.group("target"))
    match = _TRAILING_SAT.match(name)
    if match is None:
        return None
    head = match.group("head")
    if all(word.lower() in _MODIFIERS for word in head.split()):
        return None
    return _clean(f"{head}{match.group('tail')}")
