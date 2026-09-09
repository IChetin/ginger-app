"""Highlight rules and display helpers for series schedule PDF / full schedule."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Literal

from app.models.schedule import BlindLevel, Event

HighlightKind = Literal["main", "champ", "sat", "closed", "normal"]

# Guarantee threshold for championship-style highlight (₽ / base currency units).
CHAMP_GUARANTEE_THRESHOLD = Decimal("1000000")

MAIN_NAME_RE = re.compile(
    r"main\s*event|high\s*rollers?|highroller|мейн|хай[\s-]?роллер",
    re.IGNORECASE,
)
SAT_NAME_RE = re.compile(
    r"satellite|сателлит|квалификац|qualification|\bsat\b",
    re.IGNORECASE,
)
CLOSED_NAME_RE = re.compile(
    r"final\s*day|финальн\w*\s*день|\(day\s*[23]\)|\(final",
    re.IGNORECASE,
)
# Continuation flights: Day 2+, Final, FT. Day 1 / Day 1A stay open.
CLOSED_FLIGHT_RE = re.compile(
    r"(?:^(?:day\s*)?(?:[2-9]|\d{2,})\b|final|финал|^\s*ft\b)",
    re.IGNORECASE,
)

PDF_TAG_WHITELIST = ("PKO", "PLO", "PLO5", "TV", "KO", "8-max", "9-max")


def is_closed_event(*, name: str, flight_label: str | None = None) -> bool:
    """Registration-closed day — Final / Day 2+, not a freeroll with buy-in 0."""
    if CLOSED_NAME_RE.search(name):
        return True
    return bool(flight_label and CLOSED_FLIGHT_RE.search(flight_label.strip()))


def classify_highlight(
    *,
    name: str,
    buyin: Decimal,
    guarantee: Decimal | None,
    tags: list[str],
    flight_label: str | None = None,
) -> HighlightKind:
    if is_closed_event(name=name, flight_label=flight_label):
        return "closed"
    tag_set = {tag.lower() for tag in tags}
    if "main" in tag_set or MAIN_NAME_RE.search(name):
        return "main"
    if (
        "championship" in name.lower()
        or "чемпионат" in name.lower()
        or (guarantee is not None and guarantee >= CHAMP_GUARANTEE_THRESHOLD)
    ):
        return "champ"
    if "satellite" in tag_set or SAT_NAME_RE.search(name):
        return "sat"
    return "normal"


def format_money_plain(value: Decimal) -> str:
    """Format with thin-space thousands, no currency symbol, drop .00."""
    quantized = value.quantize(Decimal("1")) if value == value.to_integral_value() else value
    raw = format(quantized, "f")
    if "." in raw:
        whole, frac = raw.split(".", 1)
        frac = frac.rstrip("0")
        body = f"{whole},{frac}" if frac else whole
    else:
        body = raw
    sign = ""
    if body.startswith("-"):
        sign = "-"
        body = body[1:]
    parts: list[str] = []
    while body:
        parts.append(body[-3:])
        body = body[:-3]
    return sign + "\u00a0".join(reversed(parts))


def format_buyin_display(
    *,
    buyin: Decimal,
    buyin_bounty: Decimal | None,
    closed: bool,
) -> str:
    """buyin = total; bounty only for display: (buyin - bounty)+bounty."""
    if closed:
        return "closed"
    if buyin_bounty is not None and buyin_bounty > 0 and buyin_bounty < buyin:
        prize = buyin - buyin_bounty
        return f"{format_money_plain(prize)}+{format_money_plain(buyin_bounty)}"
    return format_money_plain(buyin)


def format_level_duration(
    levels: list[BlindLevel],
    *,
    structure_set: str | None = None,
) -> str | None:
    play = [level for level in levels if not level.is_break]
    if not play:
        return None

    if structure_set:
        filtered = [level for level in play if level.structure_set_label == structure_set]
        if filtered:
            play = filtered
    else:
        defaults = [level for level in play if level.structure_set_label == "default"]
        if defaults:
            play = defaults
        else:
            first_label = sorted({level.structure_set_label for level in play})[0]
            play = [level for level in play if level.structure_set_label == first_label]

    play = sorted(play, key=lambda item: item.level_no)
    runs: list[int] = []
    for level in play:
        if not runs or runs[-1] != level.minutes:
            runs.append(level.minutes)
    if not runs:
        return None
    if len(runs) == 1:
        return f"{runs[0]} мин"
    if len(runs) > 3:
        return f"{runs[0]}/{runs[-1]} мин"
    return "/".join(str(item) for item in runs) + " мин"


def resolve_late_reg_level(event: Event) -> int | None:
    if event.late_reg_level is not None:
        return event.late_reg_level
    for level in event.blind_levels:
        if level.is_late_reg_end:
            return level.level_no
    return None


def pdf_tags_for_event(*, name: str, tags: list[str], game_type: str) -> list[str]:
    result: list[str] = []
    lowered_name = name.lower()
    skip = {"main", "satellite", "turbo", "deepstack", "freezeout"}
    for tag in tags:
        lower = tag.lower()
        if lower in skip:
            continue
        label = "PKO" if lower in {"bounty", "ko", "pko"} else tag.upper()
        if label in PDF_TAG_WHITELIST or len(label) <= 5:
            result.append(label)
    if game_type == "plo5" and "PLO5" not in result:
        result.append("PLO5")
    elif game_type == "plo" and "PLO" not in result and "PLO5" not in result:
        result.append("PLO")
    if "tv" in lowered_name and "TV" not in result:
        result.append("TV")
    knockout = "pko" in lowered_name or "knockout" in lowered_name or "нокаут" in lowered_name
    if knockout and "PKO" not in result:
        result.append("PKO")
    seen: set[str] = set()
    ordered: list[str] = []
    for item in result:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered[:4]
