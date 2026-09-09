"""Slug helpers for venues/organizers/series/events."""

from __future__ import annotations

import re
import unicodedata

_CYRILLIC = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "e",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "h",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "sch",
        "ъ": "",
        "ы": "y",
        "ь": "",
        "э": "e",
        "ю": "yu",
        "я": "ya",
    }
)

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

DEFAULT_SLUG_MAX_LEN = 64
SERIES_EVENT_SLUG_MAX_LEN = 80


def is_valid_slug(value: str, *, max_len: int = 120) -> bool:
    return bool(_SLUG_RE.fullmatch(value)) and 1 <= len(value) <= max_len


def looks_like_uuid(value: str) -> bool:
    return bool(_UUID_RE.fullmatch(value))


def slugify(
    value: str,
    *,
    fallback: str = "item",
    max_len: int = DEFAULT_SLUG_MAX_LEN,
) -> str:
    text = unicodedata.normalize("NFKC", value).strip().lower()
    text = text.translate(_CYRILLIC)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    if not text:
        text = fallback
    return text[:max_len].strip("-") or fallback


def with_unique_suffix(base: str, taken: set[str], *, max_len: int) -> str:
    """Return base or base-2, base-3… not present in taken (adds to taken)."""
    candidate = base[:max_len].strip("-") or "item"
    if candidate not in taken:
        taken.add(candidate)
        return candidate
    n = 2
    while True:
        suffix = f"-{n}"
        trimmed = base[: max(1, max_len - len(suffix))].rstrip("-")
        candidate = f"{trimmed}{suffix}"
        if candidate not in taken:
            taken.add(candidate)
            return candidate
        n += 1
