"""Тестовые файлы массовой загрузки — из поставляемого шаблона, без бинарных фикстур.

Строки-примеры шаблона переписываются под нужный сценарий, поэтому фикстуры
не расходятся с реальным форматом файла.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2] / "docs" / "rasp_samples" / "day2_series_upload.xlsx"
)

SHEET = "Турниры"
FIRST_DATA_ROW = 2

# Колонки листа «Турниры» в порядке шаблона.
HEADERS = (
    "series_key",
    "series_name",
    "organizer",
    "venue",
    "city",
    "country",
    "timezone",
    "series_start",
    "series_end",
    "currency",
    "series_guarantee",
    "poster_url",
    "source_url",
    "event_key",
    "event_number",
    "event_name",
    "flight",
    "date",
    "time",
    "buyin",
    "buyin_bounty",
    "guarantee",
    "game_type",
    "tags",
    "start_stack",
    "start_blinds",
    "levels",
    "reentry",
    "late_reg_level",
    "itm_note",
    "is_final",
    "status",
    "notes",
)

RPT_SERIES: dict[str, Any] = {
    "series_key": "test-rpt-kaliningrad",
    "series_name": "Test RPT Kaliningrad",
    "organizer": "Test RPT",
    "venue": "Test Sobranie Poker Club",
    "city": "Калининград",
    "country": "RU",
    "timezone": "Europe/Kaliningrad",
    "series_start": "01.08.2026",
    "series_end": "11.08.2026",
    "currency": "RUB",
    "series_guarantee": 35000000,
    "source_url": "https://t.me/rpt_poker/1234",
}

BPT_SERIES: dict[str, Any] = {
    "series_key": "test-bpt-minsk",
    "series_name": "Test Belarus Poker Tour 53",
    "organizer": "Test BPT",
    "venue": "Test Casino Opera",
    "city": "Минск",
    "country": "BY",
    "timezone": "Europe/Minsk",
    "series_start": "09.01.2027",
    "series_end": "19.01.2027",
    "currency": "USD",
    "series_guarantee": 500000,
}


def _row(series: dict[str, Any], **event: Any) -> dict[str, Any]:
    return {**series, **event}


def default_rows() -> list[dict[str, Any]]:
    """Две серии, пять строк: Main Event с двумя днями и финалом + одиночный старт."""
    return [
        _row(
            RPT_SERIES,
            event_key="4",
            event_number=4,
            event_name="Kaliningrad Knockout Championship",
            flight="Day 1A",
            date="01.08.2026",
            time="12:00",
            buyin=14000,
            buyin_bounty=6000,
            guarantee=4000000,
            game_type="NLH",
            tags="bounty, pko",
            start_stack=20000,
            start_blinds="100/200/200",
            levels="30",
            reentry=2,
            late_reg_level=10,
            itm_note="till 12%",
            is_final="нет",
            status="scheduled",
        ),
        _row(
            RPT_SERIES,
            event_key="4",
            event_number=4,
            event_name="Kaliningrad Knockout Championship",
            flight="Day 1B",
            date="01.08.2026",
            time="18:00",
            buyin=14000,
            buyin_bounty=6000,
            guarantee=4000000,
            game_type="NLH",
            tags="bounty, pko",
            start_stack=20000,
            start_blinds="100/200/200",
            levels="30",
            reentry=2,
            late_reg_level=10,
            itm_note="till 12%",
            is_final="нет",
            status="scheduled",
        ),
        _row(
            RPT_SERIES,
            event_key="5",
            event_number=5,
            event_name="RPT Main Event",
            flight="Day 1A",
            date="08.08.2026",
            time="11:00",
            buyin=44000,
            guarantee=8000000,
            game_type="NLH",
            tags="tv",
            start_stack=50000,
            start_blinds="100/200/200",
            levels="40",
            late_reg_level=14,
            itm_note="ITM 15%",
            is_final="нет",
            status="scheduled",
        ),
        _row(
            RPT_SERIES,
            event_key="5",
            event_number=5,
            event_name="RPT Main Event",
            flight="Final Day",
            date="11.08.2026",
            time="12:00",
            guarantee=8000000,
            game_type="NLH",
            tags="tv",
            levels="45",
            is_final="да",
            status="scheduled",
            notes="Трансляция на канале серии",
        ),
        _row(
            BPT_SERIES,
            event_key="1",
            event_number=1,
            event_name="Welcome event",
            date="09.01.2027",
            time="12:00",
            buyin=175,
            buyin_bounty=50,
            game_type="NLH",
            tags="bounty",
            start_stack=30000,
            start_blinds="25/50",
            levels="25/20",
            late_reg_level=10,
            is_final="нет",
            status="scheduled",
        ),
    ]


def build_workbook(rows: list[dict[str, Any]], *, keep_demo_rows: bool = False) -> bytes:
    """Кладёт строки на лист «Турниры» шаблона, сохраняя шапку и заливку примеров."""
    workbook = load_workbook(TEMPLATE_PATH)
    sheet = workbook[SHEET]

    start = FIRST_DATA_ROW
    if keep_demo_rows:
        start = FIRST_DATA_ROW + 5
    else:
        for row_no in range(FIRST_DATA_ROW, sheet.max_row + 1):
            for col_no in range(1, len(HEADERS) + 1):
                sheet.cell(row_no, col_no).value = None

    for offset, values in enumerate(rows):
        for col_no, header in enumerate(HEADERS, start=1):
            sheet.cell(start + offset, col_no).value = values.get(header)

    buffer = io.BytesIO()
    workbook.save(buffer)
    workbook.close()
    return buffer.getvalue()


def template_bytes() -> bytes:
    return TEMPLATE_PATH.read_bytes()
