"""Transliteration and PDF filename helpers."""

from __future__ import annotations

import re
from datetime import date

_TRANSLIT = {
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

_MONTHS_RU = (
    r"январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|"
    r"август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья]"
)
_MONTHS_EN = (
    r"january|february|march|april|may|june|july|august|september|"
    r"october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec"
)
_MONTHS_TRANSLIT = (
    r"yanvarya|fevralya|marta|aprelya|maya|iyunya|iyulya|avgusta|"
    r"sentyabrya|oktyabrya|noyabrya|dekabrya|yanvar|fevral|avgust|"
    r"sentyabr|oktyabr|noyabr|dekabr"
)

_MAX_FILENAME_LEN = 80


def translit_slug(text: str) -> str:
    chars: list[str] = []
    for char in text.strip():
        lower = char.lower()
        if lower in _TRANSLIT:
            chars.append(_TRANSLIT[lower])
        elif char.isascii() and (char.isalnum() or char in {" ", "-", "_"}):
            chars.append(char)
        else:
            chars.append("-")
    slug = "".join(chars)
    slug = re.sub(r"[\s_]+", "_", slug)
    slug = re.sub(r"[^A-Za-z0-9_-]+", "", slug)
    slug = re.sub(r"_+", "_", slug).strip("_-")
    return slug or "Series"


def strip_dates_from_series_name(name: str) -> str:
    """Remove day ranges / months / years so they don't duplicate the period suffix."""
    text = name.replace("–", "-").replace("—", "-").replace("−", "-")
    # "17-30 августа" / "1-11 августа 2026"
    text = re.sub(
        rf"\b\d{{1,2}}\s*-\s*\d{{1,2}}\s+(?:{_MONTHS_RU}|{_MONTHS_EN})\b(?:\s+20\d{{2}})?",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    # "август 2026" / "August 2026"
    text = re.sub(
        rf"\b(?:{_MONTHS_RU}|{_MONTHS_EN})\s+20\d{{2}}\b",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    # standalone year
    text = re.sub(r"\b20\d{2}\b", " ", text)
    # leftover day ranges
    text = re.sub(r"\b\d{1,2}\s*-\s*\d{1,2}\b", " ", text)
    return re.sub(r"\s+", " ", text).strip(" -_,.")


def _clean_translit_name(slug: str) -> str:
    cleaned = slug
    cleaned = re.sub(r"_?\d{1,2}-\d{1,2}(?=_|$)", "", cleaned)
    cleaned = re.sub(rf"_?(?:{_MONTHS_TRANSLIT})(?=_|$)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"_?20\d{2}(?=_|$)", "", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_-")
    return cleaned or "Series"


def pdf_filename(*, organizer_slug: str, series_name: str, starts_on: date, ends_on: date) -> str:
    org = translit_slug(organizer_slug).replace("-", "_")
    cleaned_name = strip_dates_from_series_name(series_name)
    name = _clean_translit_name(translit_slug(cleaned_name))
    if name.lower().startswith(org.lower() + "_"):
        name = name[len(org) + 1 :]
    if name.lower() == org.lower():
        name = ""
    name = name.strip("_-")

    if starts_on.year == ends_on.year and starts_on.month == ends_on.month:
        period = f"{starts_on.year}-{starts_on.month:02d}"
    elif starts_on.year == ends_on.year:
        period = f"{starts_on.year}-{starts_on.month:02d}_{ends_on.month:02d}"
    else:
        period = f"{starts_on.year}-{starts_on.month:02d}_{ends_on.year}-{ends_on.month:02d}"

    parts = [part for part in ("Day2", org, name, period) if part]
    filename = "_".join(parts) + ".pdf"
    if len(filename) <= _MAX_FILENAME_LEN:
        return filename

    # Truncate series slug to fit.
    overhead = len(filename) - len(name)
    max_name = max(8, _MAX_FILENAME_LEN - overhead)
    name = name[:max_name].rstrip("_-")
    return "_".join(part for part in ("Day2", org, name, period) if part) + ".pdf"
