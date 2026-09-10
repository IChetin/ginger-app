"""Buy-in filter presets for the schedule."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

BuyinPreset = Literal["lt10k", "10-50k", "gte50k"]

BUYIN_PRESET_IDS: tuple[BuyinPreset, ...] = ("lt10k", "10-50k", "gte50k")

# Ranges in the user's base currency. Boundaries are exclusive between buckets:
# lt10k: [0, 10000); 10-50k: [10000, 50000); gte50k: [50000, +inf)
_PRESET_BOUNDS: dict[BuyinPreset, tuple[Decimal | None, Decimal | None]] = {
    "lt10k": (None, Decimal("10000")),
    "10-50k": (Decimal("10000"), Decimal("50000")),
    "gte50k": (Decimal("50000"), None),
}


def parse_buyin_presets(raw: str | list[str] | None) -> list[BuyinPreset]:
    if raw is None:
        return []
    parts = raw if isinstance(raw, list) else raw.split(",")
    result: list[BuyinPreset] = []
    seen: set[str] = set()
    for part in parts:
        value = part.strip()
        if not value or value in seen:
            continue
        if value not in _PRESET_BOUNDS:
            continue
        seen.add(value)
        result.append(value)  # type: ignore[arg-type]
    return result


def amount_matches_presets(amount: Decimal, presets: list[BuyinPreset]) -> bool:
    if not presets:
        return True
    for preset in presets:
        lo, hi = _PRESET_BOUNDS[preset]
        if lo is not None and amount < lo:
            continue
        if hi is not None and amount >= hi:
            continue
        return True
    return False


def preset_to_min_max(preset: BuyinPreset) -> tuple[Decimal | None, Decimal | None]:
    return _PRESET_BOUNDS[preset]
