"""Приведение значений ячеек шаблона к типам домена.

Функции бросают `CellError`, когда значение нельзя понять: вызывающий код ловит
её и превращает в `BulkIssue` с номером строки и буквой колонки.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from app.models.enums import EventStatus, GameType

_EXCEL_EPOCH = datetime(1899, 12, 30)

# Пробелы, которыми Excel и копипаста разбивают разряды: обычный, неразрывный,
# узкий неразрывный, тонкий.
_SPACES = "\u0020\u00a0\u202f\u2009"
_MONEY_NOISE_RE = re.compile(r"[^\d,.\-]")
_TAG_SPLIT_RE = re.compile(r"[,;/]")

_UNLIMITED_WORDS = frozenset(
    {"безлимит", "безлимитно", "unlimited", "unlim", "unl", "∞", "много", "любое"}
)
_TRUE_WORDS = frozenset({"да", "yes", "true", "y", "д", "1", "+", "есть"})
_FALSE_WORDS = frozenset({"нет", "no", "false", "n", "н", "0", "-", "—", "без"})

_GAME_TYPE_ALIASES: dict[str, GameType] = {
    "nlh": GameType.NLH,
    "nl": GameType.NLH,
    "nlhe": GameType.NLH,
    "holdem": GameType.NLH,
    "holdem nl": GameType.NLH,
    "texas holdem": GameType.NLH,
    "холдем": GameType.NLH,
    "plo": GameType.PLO,
    "plo4": GameType.PLO,
    "omaha": GameType.PLO,
    "омаха": GameType.PLO,
    "plo5": GameType.PLO5,
    "omaha5": GameType.PLO5,
    "5card plo": GameType.PLO5,
    "mixed": GameType.MIXED,
    "mix": GameType.MIXED,
    "микс": GameType.MIXED,
    "other": GameType.OTHER,
    "другое": GameType.OTHER,
}

_EVENT_STATUS_ALIASES: dict[str, EventStatus] = {
    "scheduled": EventStatus.SCHEDULED,
    "запланирован": EventStatus.SCHEDULED,
    "запланировано": EventStatus.SCHEDULED,
    "changed": EventStatus.CHANGED,
    "изменён": EventStatus.CHANGED,
    "изменен": EventStatus.CHANGED,
    "перенесён": EventStatus.CHANGED,
    "перенесен": EventStatus.CHANGED,
    "cancelled": EventStatus.CANCELLED,
    "canceled": EventStatus.CANCELLED,
    "отменён": EventStatus.CANCELLED,
    "отменен": EventStatus.CANCELLED,
}

_DATE_PATTERNS = (
    (re.compile(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$"), ("d", "m", "y")),
    (re.compile(r"^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$"), ("y", "m", "d")),
    (re.compile(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})$"), ("d", "m", "yy")),
)


class CellError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Parsed[T]:
    value: T
    warning: str | None = None


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = " ".join(value.split())
        return text or None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value)


def parse_decimal(value: Any) -> Parsed[Decimal | None]:
    """Число из ячейки. Текст вида «44 000 ₽» чистится с предупреждением."""
    if value is None or value == "":
        return Parsed(None)
    if isinstance(value, bool):
        raise CellError("not_a_number", "ожидалось число")
    if isinstance(value, int | Decimal):
        return Parsed(Decimal(value))
    if isinstance(value, float):
        return Parsed(Decimal(str(value)))
    if not isinstance(value, str):
        raise CellError("not_a_number", "ожидалось число")

    raw = value.strip()
    stripped = _MONEY_NOISE_RE.sub("", raw.translate({ord(ch): None for ch in _SPACES}))
    if not stripped or stripped in {"-", ",", "."}:
        raise CellError("not_a_number", f"«{raw}» не похоже на число")
    # 1 234,56 и 1 234.56 — одна и та же запись с разным десятичным разделителем.
    if "," in stripped and "." in stripped:
        stripped = stripped.replace(",", "")
    else:
        stripped = stripped.replace(",", ".")
    try:
        parsed = Decimal(stripped)
    except InvalidOperation as exc:
        raise CellError("not_a_number", f"«{raw}» не похоже на число") from exc
    warning = "money_cleaned" if stripped != raw else None
    return Parsed(parsed, warning)


def parse_money(value: Any) -> Parsed[Decimal | None]:
    parsed = parse_decimal(value)
    if parsed.value is None:
        return parsed
    if parsed.value < 0:
        raise CellError("negative_money", "сумма не может быть отрицательной")
    return Parsed(parsed.value.quantize(Decimal("0.01")), parsed.warning)


def parse_int(value: Any) -> Parsed[int | None]:
    parsed = parse_decimal(value)
    if parsed.value is None:
        return Parsed(None, parsed.warning)
    if parsed.value != parsed.value.to_integral_value():
        raise CellError("not_an_integer", "ожидалось целое число")
    return Parsed(int(parsed.value), parsed.warning)


def parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, int | float) and not isinstance(value, bool):
        return (_EXCEL_EPOCH + timedelta(days=float(value))).date()
    if not isinstance(value, str):
        raise CellError("bad_date", "ожидалась дата")

    raw = value.strip()
    for pattern, order in _DATE_PATTERNS:
        match = pattern.match(raw)
        if match is None:
            continue
        parts = dict(zip(order, (int(item) for item in match.groups()), strict=True))
        year = parts.get("y") or 2000 + parts["yy"]
        try:
            return date(year, parts["m"], parts["d"])
        except ValueError as exc:
            raise CellError("bad_date", f"«{raw}» — несуществующая дата") from exc
    raise CellError("bad_date", f"«{raw}» не похоже на дату (нужен формат 01.08.2026)")


def parse_time(value: Any) -> time | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.time().replace(second=0, microsecond=0)
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    if isinstance(value, int | float) and not isinstance(value, bool):
        fraction = float(value) % 1
        minutes = round(fraction * 24 * 60)
        return time(hour=(minutes // 60) % 24, minute=minutes % 60)
    if not isinstance(value, str):
        raise CellError("bad_time", "ожидалось время")

    raw = value.strip()
    match = re.match(r"^(\d{1,2})[:.\-\s](\d{2})(?::\d{2})?$", raw)
    if match is None:
        raise CellError("bad_time", f"«{raw}» не похоже на время (нужен формат 18:00)")
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        raise CellError("bad_time", f"«{raw}» — несуществующее время")
    return time(hour=hour, minute=minute)


def parse_bool(value: Any) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float):
        return bool(value)
    text = str(value).strip().lower()
    if text in _TRUE_WORDS:
        return True
    if text in _FALSE_WORDS:
        return False
    raise CellError("bad_bool", f"«{value}» — ожидалось «да» или «нет»")


def parse_tags(value: Any) -> list[str]:
    text = clean_text(value)
    if text is None:
        return []
    tags: list[str] = []
    for chunk in _TAG_SPLIT_RE.split(text):
        tag = chunk.strip().lower()
        # На листе «Справочники» теги записаны как «bounty — ноклаут».
        tag = re.split(r"\s+[—–-]\s+", tag)[0].strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def parse_reentry(value: Any) -> tuple[int | None, bool]:
    """Возвращает (кол-во ре-энтри, безлимит)."""
    if value is None or value == "":
        return None, False
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _UNLIMITED_WORDS:
            return None, True
        if text in _FALSE_WORDS:
            return 0, False
    parsed = parse_int(value)
    if parsed.value is None:
        return None, False
    if parsed.value < 0:
        raise CellError("bad_reentry", "количество ре-энтри не может быть отрицательным")
    return parsed.value, False


def parse_game_type(value: Any) -> GameType | None:
    """None = ячейка пуста: при создании берётся NLH, при обновлении поле не трогаем."""
    text = clean_text(value)
    if text is None:
        return None
    resolved = _GAME_TYPE_ALIASES.get(text.lower())
    if resolved is None:
        raise CellError("unknown_game_type", f"дисциплина «{text}» не из справочника")
    return resolved


def parse_event_status(value: Any) -> EventStatus | None:
    text = clean_text(value)
    if text is None:
        return None
    resolved = _EVENT_STATUS_ALIASES.get(text.lower())
    if resolved is None:
        raise CellError("unknown_status", f"статус «{text}» не из справочника")
    return resolved


def parse_country_code(value: Any) -> str:
    text = clean_text(value)
    if text is None:
        raise CellError("missing_country", "страна не заполнена")
    # На листе «Справочники» страна записана как «RU — Россия».
    match = re.match(r"^([A-Za-zА-Яа-я]{2})\b", text)
    if match is None or not match.group(1).isascii():
        raise CellError("bad_country", f"«{text}» не похоже на код страны (нужен RU, BY, CY)")
    return match.group(1).upper()


def parse_currency_code(value: Any) -> str:
    text = clean_text(value)
    if text is None:
        raise CellError("missing_currency", "валюта не заполнена")
    match = re.match(r"^([A-Za-z]{3})\b", text)
    if match is None:
        raise CellError("bad_currency", f"«{text}» не похоже на код валюты (нужен RUB, USD, EUR)")
    return match.group(1).upper()


def normalize_key(value: str) -> str:
    """Ключ идемпотентности: регистр и лишние пробелы не должны создавать дубликат."""
    return " ".join(value.split()).lower()


def normalize_name(value: str) -> str:
    """Сопоставление справочников по названию без учёта регистра и лишних пробелов."""
    return " ".join(value.split()).casefold()
