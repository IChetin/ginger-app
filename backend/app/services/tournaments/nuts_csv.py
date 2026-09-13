"""Импорт недельной сетки NUTS (Google Sheets → CSV) в шаблоны турниров.

Формат листа:

    ,MONDAY,,,…                                   ← заголовок дня
    ,-5,-3,UTC,+1,+2,+3,+8,+10,GTD,NAME,Game,…     ← шапка колонок
    ,0:00,2:00,…,8:00,…,1 000,FAST CRAZY,NLH,8,…   ← турнир

Граница суток в листе проведена по колонке «-5»: строки дня идут с 0:00 по -5, то есть
с 08:00 МСК до 07:59 МСК следующего дня. Поэтому день недели по МСК считаем от времени «-5»
плюс 8 часов, а колонку «+3» используем как сверку.

Одинаковые турниры разных дней сворачиваются в один шаблон с набором дней. Если у турнира
в какой-то день отличаются поля (обычно на выходных ниже гарантия), получается несколько
шаблонов с одним названием и временем.
"""

from __future__ import annotations

import csv
import io
import re
from collections import OrderedDict
from datetime import time
from decimal import Decimal, InvalidOperation

from app.models.enums import BountyKind, GameType
from app.schemas.tournaments import ParseIssue, TemplateDraft, TemplateParseResult
from app.services.tournaments.late_reg import late_reg_close_offset

SOURCE = "nuts-csv"

_WEEKDAYS = {
    "MONDAY": 1,
    "TUESDAY": 2,
    "WEDNESDAY": 3,
    "THURSDAY": 4,
    "FRIDAY": 5,
    "SATURDAY": 6,
    "SUNDAY": 7,
}
# Сдвиг МСК относительно колонки «-5», в минутах.
_MSK_SHIFT_FROM_MINUS5 = 8 * 60
_MINUTES_IN_DAY = 24 * 60

_REQUIRED_COLUMNS = ("-5", "+3", "NAME", "Buy-in")
_TIME = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*$")


class NutsCsvError(ValueError):
    """Файл не похож на сетку NUTS — дальше разбирать нечего."""


def normalize_name(value: str) -> str:
    """«  MAIN  SAT » → «MAIN SAT». В листе встречаются двойные и ведущие пробелы, из-за
    них один турнир выглядел бы двумя."""
    return " ".join(value.split())


def _decimal(value: str) -> Decimal | None:
    """«1,6» → 1.6; «1 000» (с неразрывным пробелом) → 1000; пусто → None."""
    cleaned = value.replace("\xa0", "").replace(" ", "").replace(",", ".").strip()
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _int(value: str) -> int | None:
    number = _decimal(value)
    if number is None or number != number.to_integral_value():
        return None
    return int(number)


def _text(value: str) -> str | None:
    cleaned = normalize_name(value)
    return cleaned or None


def _minutes(value: str) -> int | None:
    match = _TIME.match(value)
    if match is None:
        return None
    hours, minutes = int(match.group(1)), int(match.group(2))
    if hours > 23 or minutes > 59:
        return None
    return hours * 60 + minutes


def classify_game(game: str, name: str) -> tuple[GameType, BountyKind]:
    """Колонка Game: «NLH», «NLH PKO», «PLO5 PKO», «NLH KO», «PKO», «NLH MKO», «NLH 6+»…"""
    tokens = game.upper().split()
    upper_name = name.upper()

    if any(token.startswith("PLO5") for token in tokens):
        game_type = GameType.PLO5
    elif any(token.startswith("PLO") for token in tokens):
        game_type = GameType.PLO
    elif "6+" in tokens:
        game_type = GameType.OTHER
    else:
        game_type = GameType.NLH

    if "MKO" in tokens or "MYSTERY" in upper_name:
        bounty = BountyKind.MYSTERY
    elif "PKO" in tokens:
        bounty = BountyKind.PKO
    elif "KO" in tokens:
        bounty = BountyKind.KO
    else:
        bounty = BountyKind.NONE
    return game_type, bounty


def _structure(value: str) -> str | None:
    cleaned = _text(value)
    if cleaned is None:
        return None
    # «DeepStack» и «Deepstack» в листе — одно и то же.
    return cleaned[:1].upper() + cleaned[1:].lower()


def parse_nuts_csv(data: bytes) -> TemplateParseResult:
    text = data.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))

    header: dict[str, int] | None = None
    weekday: int | None = None
    issues: list[ParseIssue] = []
    # Ключ — все поля турнира, кроме дня; значение — черновик с накопленными днями.
    groups: OrderedDict[tuple[object, ...], TemplateDraft] = OrderedDict()
    rows_total = 0

    for index, row in enumerate(rows, start=1):
        cells = [cell.strip() for cell in row]
        marker = next((cell.upper() for cell in cells if cell), "")
        if marker in _WEEKDAYS:
            weekday = _WEEKDAYS[marker]
            continue
        if "NAME" in cells and "-5" in cells:
            header = {name: position for position, name in enumerate(cells) if name}
            missing = [column for column in _REQUIRED_COLUMNS if column not in header]
            if missing:
                raise NutsCsvError(f"В шапке нет колонок: {', '.join(missing)}")
            continue
        if header is None:
            continue

        columns = header

        def cell(column: str, row: list[str] = row, columns: dict[str, int] = columns) -> str:
            position = columns.get(column)
            if position is None or position >= len(row):
                return ""
            return row[position]

        raw_name = cell("NAME")
        if not raw_name.strip():
            continue
        rows_total += 1
        name = normalize_name(raw_name)

        if weekday is None:
            issues.append(ParseIssue(row=index, message=f"{name}: строка до заголовка дня"))
            continue
        base_minutes = _minutes(cell("-5"))
        msk_minutes_check = _minutes(cell("+3"))
        if base_minutes is None:
            issues.append(ParseIssue(row=index, message=f"{name}: не разобрано время «-5»"))
            continue
        shifted = base_minutes + _MSK_SHIFT_FROM_MINUS5
        msk_minutes = shifted % _MINUTES_IN_DAY
        msk_weekday = (weekday - 1 + shifted // _MINUTES_IN_DAY) % 7 + 1
        if msk_minutes_check is not None and msk_minutes_check != msk_minutes:
            issues.append(
                ParseIssue(
                    row=index,
                    message=f"{name}: время МСК {cell('+3')} не сходится с «-5» {cell('-5')}",
                )
            )

        buyin = _decimal(cell("Buy-in"))
        if buyin is None:
            issues.append(ParseIssue(row=index, message=f"{name}: не разобран бай-ин"))
            continue

        game_type, bounty_kind = classify_game(cell("Game"), name)
        late_reg_levels = _int(cell("Late reg"))
        level_minutes = _text(cell("Minutes"))
        start_time = time(msk_minutes // 60, msk_minutes % 60)
        offset = (
            late_reg_close_offset(start_time.minute, late_reg_levels, level_minutes)
            if late_reg_levels
            else None
        )

        draft = TemplateDraft(
            name=name,
            game_type=game_type,
            bounty_kind=bounty_kind,
            buyin=buyin,
            guarantee=_decimal(cell("GTD")),
            rebuy_cost=_decimal(cell("Rebuy")),
            rebuy_terms=_text(cell("Rebuys")),
            addon_cost=_decimal(cell("Add-on")),
            addon_terms=_text(cell("Add-ons")),
            start_stack=_int(cell("Stack")),
            table_size=_int(cell("Players")),
            late_reg_levels=late_reg_levels,
            level_minutes=level_minutes,
            structure=_structure(cell("Structure")),
            ticket_value=_decimal(cell("Ticket")),
            early_bird_players=_int(cell("EB")),
            weekdays=[msk_weekday],
            start_time=start_time,
            late_reg_close_offset_min=offset,
        )
        key = tuple(value for field, value in draft.model_dump().items() if field != "weekdays")
        existing = groups.get(key)
        if existing is None:
            groups[key] = draft
        elif msk_weekday not in existing.weekdays:
            existing.weekdays.append(msk_weekday)
        else:
            issues.append(ParseIssue(row=index, message=f"{name}: дубль в тот же день"))

    if header is None:
        raise NutsCsvError("Не найдена шапка с колонками NAME и -5")

    templates = list(groups.values())
    for template in templates:
        template.weekdays.sort()
    templates.sort(key=lambda item: (item.start_time, item.name, item.weekdays))
    return TemplateParseResult(templates=templates, issues=issues, rows_total=rows_total)
