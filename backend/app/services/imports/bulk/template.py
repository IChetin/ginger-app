"""Описание Excel-шаблона массовой загрузки (`docs/rasp_samples/day2_series_upload.xlsx`)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Final

SHEET_NAME: Final = "Турниры"
IGNORED_SHEETS: Final = frozenset({"Инструкция", "Справочники"})

# Заливка строк-примеров в шапке шаблона (кремовый). Вспомогательный сигнал:
# при протягивании вниз Excel копирует формат, поэтому решает отпечаток строки.
DEMO_FILL_RGB: Final = frozenset({"00FBF3DF", "FFFBF3DF", "FBF3DF"})

DEMO_SERIES_KEYS: Final = frozenset({"rpt-kaliningrad-2026-08", "bpt-minsk-2027-01"})


@dataclass(frozen=True)
class TemplateColumn:
    field: str
    title: str
    label: str
    required: bool = False


SERIES_COLUMNS: Final[tuple[TemplateColumn, ...]] = (
    TemplateColumn("series_key", "series_key", "ключ серии", required=True),
    TemplateColumn("series_name", "series_name", "название серии", required=True),
    TemplateColumn("organizer", "organizer", "организатор", required=True),
    TemplateColumn("venue", "venue", "площадка", required=True),
    TemplateColumn("city", "city", "город", required=True),
    TemplateColumn("country", "country", "страна", required=True),
    TemplateColumn("timezone", "timezone", "часовой пояс", required=True),
    TemplateColumn("series_start", "series_start", "начало серии", required=True),
    TemplateColumn("series_end", "series_end", "конец серии", required=True),
    TemplateColumn("currency", "currency", "валюта", required=True),
    TemplateColumn("series_guarantee", "series_guarantee", "гарантия серии"),
    TemplateColumn("poster_url", "poster_url", "афиша"),
    TemplateColumn("source_url", "source_url", "источник"),
)

EVENT_COLUMNS: Final[tuple[TemplateColumn, ...]] = (
    TemplateColumn("event_key", "event_key", "ключ турнира", required=True),
    TemplateColumn("event_number", "event_number", "номер турнира"),
    TemplateColumn("event_name", "event_name", "название турнира", required=True),
    TemplateColumn("flight", "flight", "флайт"),
    TemplateColumn("date", "date", "дата", required=True),
    TemplateColumn("time", "time", "время", required=True),
    TemplateColumn("buyin", "buyin", "бай-ин"),
    TemplateColumn("buyin_bounty", "buyin_bounty", "баунти-часть"),
    TemplateColumn("guarantee", "guarantee", "гарантия"),
    TemplateColumn("game_type", "game_type", "дисциплина"),
    TemplateColumn("tags", "tags", "теги"),
    TemplateColumn("start_stack", "start_stack", "стартовый стек"),
    TemplateColumn("start_blinds", "start_blinds", "стартовые блайнды"),
    TemplateColumn("levels", "levels", "уровни"),
    TemplateColumn("reentry", "reentry", "ре-энтри"),
    TemplateColumn("late_reg_level", "late_reg_level", "поздняя регистрация"),
    TemplateColumn("itm_note", "itm_note", "заметка ITM"),
    TemplateColumn("is_final", "is_final", "финальный день"),
    TemplateColumn("status", "status", "статус"),
    TemplateColumn("notes", "notes", "заметки"),
)

COLUMNS: Final[tuple[TemplateColumn, ...]] = SERIES_COLUMNS + EVENT_COLUMNS
COLUMN_BY_TITLE: Final[dict[str, TemplateColumn]] = {item.title: item for item in COLUMNS}
COLUMN_BY_FIELD: Final[dict[str, TemplateColumn]] = {item.field: item for item in COLUMNS}
REQUIRED_FIELDS: Final[tuple[str, ...]] = tuple(item.field for item in COLUMNS if item.required)

# Поля серии, которые обязаны совпадать во всех строках одной серии.
SERIES_CONSISTENCY_FIELDS: Final[tuple[str, ...]] = tuple(
    item.field for item in SERIES_COLUMNS if item.field != "series_key"
)

# Поля турнира, которые обязаны совпадать во всех строках одного турнира.
EVENT_CONSISTENCY_FIELDS: Final[tuple[str, ...]] = (
    "event_number",
    "event_name",
    "buyin",
    "buyin_bounty",
    "guarantee",
    "game_type",
    "tags",
    "start_stack",
    "start_blinds",
    "reentry",
    "late_reg_level",
    "itm_note",
    "status",
    "notes",
)


def fingerprint_value(value: Any) -> str:
    """Нормализованное строковое представление ячейки для отпечатка строки."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == time(0, 0) else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, float):
        return format(Decimal(str(value)).normalize(), "f")
    if isinstance(value, int):
        return str(value)
    return " ".join(str(value).split())


def row_fingerprint(values: dict[str, Any]) -> str:
    """sha256 по нормализованным значениям всех колонок шаблона в фиксированном порядке."""
    payload = "\x1f".join(fingerprint_value(values.get(item.field)) for item in COLUMNS)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Отпечатки строк-примеров 2–6 из поставляемого шаблона. Пересчитываются тестом
# tests/test_bulk_import_template.py прямо из docs/rasp_samples/day2_series_upload.xlsx:
# если шаблон меняют, тест падает и константы обновляют вместе с ним.
DEMO_ROW_FINGERPRINTS: Final[frozenset[str]] = frozenset(
    {
        "4c90c4f684b1e0fa6a4603a87a4276cb39ac68b7ed5c94d1dacd2428aa8cd993",
        "88ebd9883d45de2646e1e20290b0ef8687a2dbfae46d9b045287210eb39c36b4",
        "8e161a46eb97bd4dc80eae65c11a17f05731697aecad794d5d61fb63430bb2f4",
        "a98af0299b9e56da9106aa5c7eee89d68adb61b12b55b1a82ae745692c4508a0",
        "263fc7a177b626c24a3f685607d00e61a6b4d71c1ec9b4001a5a26b8948ce4c0",
    }
)
