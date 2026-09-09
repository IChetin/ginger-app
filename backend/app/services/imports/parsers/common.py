from __future__ import annotations

import re
import zipfile
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from io import BytesIO

from app.models.enums import GameType

_MONTHS_RU = {
    "января": 1,
    "январь": 1,
    "февраля": 2,
    "февраль": 2,
    "марта": 3,
    "март": 3,
    "апреля": 4,
    "апрель": 4,
    "мая": 5,
    "май": 5,
    "июня": 6,
    "июнь": 6,
    "июля": 7,
    "июль": 7,
    "августа": 8,
    "август": 8,
    "сентября": 9,
    "сентябрь": 9,
    "октября": 10,
    "октябрь": 10,
    "ноября": 11,
    "ноябрь": 11,
    "декабря": 12,
    "декабрь": 12,
}

_STAGE_RE = re.compile(
    r"(?i)(?:^|[\s,\-])("
    r"(?:turbo\s+)?(?:day|день)\s*1[a-zа-я]?|"
    r"(?:day|день)\s*[2-4]|"
    r"final(?:\s*table|\s*day)?|финальн\w*"
    r").*$"
)

_LABEL_RE = re.compile(
    r"(?:^|[\s,\-])(?:turbo\s+)?(?:day|день)\s*1([a-zа-я])\b|"
    r"(?:^|[\s,\-])(?:day|день)\s*([2-4])\b|"
    r"\b(final(?:\s*table|\s*day)?|финальн\w*)\b",
    re.IGNORECASE,
)


def safe_xlsx_bytes(data: bytes, *, max_uncompressed: int = 80 * 1024 * 1024) -> BytesIO:
    """Validate ZIP/OOXML and return a BytesIO suitable for openpyxl."""
    if len(data) < 4 or data[:2] != b"PK":
        raise ValueError("Not a ZIP/XLSX payload")
    total = 0
    with zipfile.ZipFile(BytesIO(data)) as zf:
        names = set(zf.namelist())
        if "xl/workbook.xml" not in names:
            raise ValueError("ZIP is not a valid XLSX workbook")
        for info in zf.infolist():
            total += info.file_size
            if total > max_uncompressed:
                raise ValueError("XLSX uncompressed size exceeds safety limit")
    return BytesIO(data)


def parse_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    text = str(value).strip()
    if not text or text in {"-", "—", "–"}:
        return None
    text = text.replace("\xa0", " ").replace(" ", "").replace(",", ".")
    text = re.sub(r"[^\d.\-]", "", text)
    if not text or text in {".", "-", "-."}:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_int(value: object) -> int | None:
    decimal = parse_decimal(value)
    if decimal is None:
        return None
    return int(decimal)


def parse_ru_day_month(value: object, *, year: int) -> date | None:
    if isinstance(value, datetime):
        return value.date().replace(year=year) if value.year != year else value.date()
    if isinstance(value, date):
        return value.replace(year=year) if value.year != year else value
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip().lower()
    match = re.search(r"(\d{1,2})\s*([а-яё]+)", text)
    if not match:
        return None
    day = int(match.group(1))
    month = _MONTHS_RU.get(match.group(2))
    if month is None:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_time_value(value: object) -> time | None:
    if isinstance(value, datetime):
        return value.time().replace(microsecond=0)
    if isinstance(value, time):
        return value.replace(microsecond=0)
    if value is None:
        return None
    text = str(value).strip().lower().replace(".", ":")
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def extract_flight_label(name: str) -> str | None:
    match = _LABEL_RE.search(name)
    if not match:
        return None
    if match.group(3):
        return "Final"
    letter = match.group(1)
    if letter:
        # Normalize Cyrillic lookalikes used in labels.
        mapping = {"а": "A", "в": "B", "с": "C", "е": "E"}
        normalized = mapping.get(letter.lower(), letter.upper())
        return f"1{normalized}"
    day_num = match.group(2)
    if day_num:
        return f"Day {day_num}"
    return None


def base_event_name(name: str) -> str:
    cleaned = re.sub(r'(?i)^\s*турнир\s*"?', "", name).strip().strip('"').strip()
    cleaned = _STAGE_RE.sub("", cleaned)
    cleaned = re.sub(r"\([^)]*\)", "", cleaned)
    cleaned = re.sub(r"\[[^\]]*\]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(" -–,\"'")
    return cleaned or name.strip()


def normalize_match_key(text: str) -> str:
    value = text.lower().replace("ё", "е")
    value = re.sub(r"[^a-z0-9а-я]+", " ", value)
    replacements = {
        "knockout": "ko",
        "нокаут": "ko",
        "progressive": "pko",
        "прогрессивн": "pko",
        "championship": "champ",
        "tournament": "",
        "event": "",
        "турнир": "",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    return re.sub(r"\s+", " ", value).strip()


def detect_game_type(text: str) -> GameType:
    lower = text.lower()
    if "plo 5" in lower or "5-card" in lower or "5 card" in lower or "omaha 5" in lower:
        return GameType.PLO5
    if "omaha" in lower or "plo" in lower:
        return GameType.PLO
    if "chinese" in lower or "pineapple" in lower or "ofc" in lower:
        return GameType.OTHER
    if "texas" in lower or "hold" in lower or "nlh" in lower or "nlhe" in lower:
        return GameType.NLH
    return GameType.NLH


def detect_tags(text: str) -> list[str]:
    lower = text.lower()
    tags: list[str] = []
    mapping = [
        ("satellite", "satellite"),
        ("сателлит", "satellite"),
        ("stage", "satellite"),
        ("bounty", "bounty"),
        ("баунти", "bounty"),
        ("knockout", "bounty"),
        ("нокаут", "bounty"),
        ("pko", "pko"),
        ("progressive", "pko"),
        ("turbo", "turbo"),
        ("hyper", "turbo"),
        ("deep stack", "deepstack"),
        ("deepstack", "deepstack"),
        ("freezeout", "freezeout"),
        ("ladies", "ladies"),
        ("queen", "ladies"),
        ("45+", "seniors"),
        ("seniors", "seniors"),
        ("heads-up", "heads_up"),
        ("8 max", "8max"),
        ("8-макс", "8max"),
        ("7 max", "7max"),
        ("7-макс", "7max"),
        ("6 max", "6max"),
        ("6-макс", "6max"),
        ("freeroll", "freeroll"),
        ("free-buy", "freeroll"),
        ("free roll", "freeroll"),
    ]
    for needle, tag in mapping:
        if needle in lower and tag not in tags:
            tags.append(tag)
    return tags


def token_similarity(a: str, b: str) -> Decimal:
    left = set(normalize_match_key(a).split())
    right = set(normalize_match_key(b).split())
    if not left or not right:
        return Decimal("0")
    inter = left & right
    union = left | right
    return (Decimal(len(inter)) / Decimal(len(union))).quantize(Decimal("0.01"))
