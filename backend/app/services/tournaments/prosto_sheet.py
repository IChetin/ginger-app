"""Расписание союза «Просторы Покера» (ProSto) — клуб Private.G.

Лист Google Sheets, выгрузка CSV. В листе два блока с одинаковой шапкой
«Старт, Гарантия, Название, BUY-IN, MinStart, REBUYS, ADD-ONS, STACK, LATE REG, MINUTES,
STRUCTURE, EARLY BIRD, АКЦИЯ»:

1. Недельная сетка — дни «Понедельник» … «Воскресенье».
2. Серия («SERIY ProSto OSEN' 2026») — дни с датой: «пн 07.09». Это разовые события.

Между блоками и справа лежат служебные таблицы (выплаты, расчёты) — их пропускаем: строка
турнира начинается со времени «18:00».

Суммы — в фишках клуба: «250pp», «18РР», «300pр» (латиница и кириллица вперемешку).
Гарантия бывает не суммой: «1 билет», «iPhone 17pro» — тогда она уходит в заметку.
Строки с бай-ином «-» — финальные дни серии, куда не зарегистрироваться: пропускаем.
"""

from __future__ import annotations

import csv
import io
import re
from collections import OrderedDict
from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.schemas.tournaments import ParseIssue, TemplateDraft, TemplateParseResult
from app.services.tournaments.late_reg import late_reg_close_offset
from app.services.tournaments.nuts_csv import (
    _decimal,
    _int,
    _minutes,
    classify_game,
    normalize_name,
)
from app.services.tournaments.satellites import satellite_target

SOURCE = "prosto-sheet"

_WEEKDAYS = {
    "понедельник": 1,
    "вторник": 2,
    "среда": 3,
    "четверг": 4,
    "пятница": 5,
    "суббота": 6,
    "воскресенье": 7,
}
_SHORT_DAYS = {"пн": 1, "вт": 2, "ср": 3, "чт": 4, "пт": 5, "сб": 6, "вс": 7}
_DATED_DAY = re.compile(r"^(пн|вт|ср|чт|пт|сб|вс)\s+(\d{1,2})\.(\d{1,2})$")
# «250pp», «18РР», «300pр», «1 000рр» — буквы в любом регистре и алфавите.
_CHIPS = re.compile(r"^(?P<num>\d[\d\s .,]*?)\s*(?:[pр]{2}|пп)?$", re.IGNORECASE)
_EMOJI = re.compile("[\U0001f000-\U0001faff☀-➿⬀-⯿️‍⃣]")
_FIRST_INT = re.compile(r"(\d+)")
_EARLY_BIRD_PLACES = re.compile(r"(\d+)\s*мест", re.IGNORECASE)
_EMPTY = {"", "-", "—"}


class ProstoSheetError(ValueError):
    """Файл не похож на лист ProSto."""


def looks_like_prosto_sheet(data: bytes) -> bool:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return False
    return "Старт" in text and "Название" in text and "BUY-IN" in text and "Понедельник" in text


def clean_name(value: str) -> str:
    """«🎟️ Sat ⭐️ProSto HR» → «Sat ProSto HR»."""
    return normalize_name(_EMOJI.sub(" ", value))


def parse_chips(value: str) -> Decimal | None:
    """«250pp» → 250; «0pp/15pp» → 0 (первое значение); «1 билет» → None."""
    first = value.split("/")[0].strip()
    match = _CHIPS.match(first)
    if match is None:
        return None
    return _decimal(match.group("num"))


def _text(value: str) -> str | None:
    cleaned = normalize_name(value)
    return None if cleaned in _EMPTY else cleaned


def _structure(value: str) -> str | None:
    cleaned = _text(value)
    if cleaned is None:
        return None
    lowered = cleaned.lower()
    # «DeepSteck» в листе — это Deepstack.
    return "Deepstack" if lowered.startswith("deepst") else cleaned[:1].upper() + lowered[1:]


def _nearest_date(day: int, month: int, today: date) -> date | None:
    """Год для «16.09»: ближайший к сегодняшнему дню (серии публикуют на ближайшие недели)."""
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        return None
    if (candidate - today).days > 183:
        return candidate.replace(year=today.year - 1)
    if (today - candidate).days > 183:
        return candidate.replace(year=today.year + 1)
    return candidate


def _infer_ticket_values(templates: list[TemplateDraft]) -> None:
    """Номинал билета сателлита = бай-ин турнира, на который он ведёт.

    В листе номинала нет («1 билет»), а без него мелкий сателлит не отличить от крупного
    (скрываем сателлиты на турниры дешевле $100 / 5 000 ₽). Ищем цель по началу названия:
    «Sat BIG PKO» → «BIG PKO 1/2 Buy-in». Несколько кандидатов — берём самый дорогой, чтобы
    не спрятать сателлит по ошибке.
    """
    regular = [item for item in templates if item.satellite_target is None]
    for item in templates:
        if item.satellite_target is None or item.ticket_value is not None:
            continue
        target = item.satellite_target.lower()
        buyins = [
            candidate.buyin
            for candidate in regular
            if candidate.name.lower().startswith(target) and candidate.buyin > 0
        ]
        if buyins:
            item.ticket_value = max(buyins)


def parse_prosto_sheet(data: bytes, *, today: date | None = None) -> TemplateParseResult:
    if not looks_like_prosto_sheet(data):
        raise ProstoSheetError("Не найдена шапка «Старт, Гарантия, Название, BUY-IN»")
    today = today or datetime.now(ZoneInfo("Europe/Moscow")).date()
    rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig"))))

    section: str | None = None
    headers_seen = 0
    columns: dict[str, int] = {}
    weekday: int | None = None
    one_off: date | None = None
    issues: list[ParseIssue] = []
    groups: OrderedDict[tuple[object, ...], TemplateDraft] = OrderedDict()
    rows_total = 0

    for index, row in enumerate(rows, start=1):
        cells = [cell.strip() for cell in row]
        first = cells[0] if cells else ""
        lowered = first.lower()

        if first == "Старт" and "Название" in cells:
            columns = {name: position for position, name in enumerate(cells) if name}
            headers_seen += 1
            section = "weekly" if headers_seen == 1 else "series"
            weekday, one_off = None, None
            continue
        if section is None:
            continue
        if lowered.startswith("сайды"):
            section = None
            continue
        if section == "weekly" and lowered in _WEEKDAYS:
            weekday = _WEEKDAYS[lowered]
            continue
        dated = _DATED_DAY.match(lowered)
        if section == "series" and dated:
            weekday = _SHORT_DAYS[dated.group(1)]
            one_off = _nearest_date(int(dated.group(2)), int(dated.group(3)), today)
            continue

        minutes = _minutes(first)
        if minutes is None:
            continue

        def cell(name: str, cells: list[str] = cells, columns: dict[str, int] = columns) -> str:
            position = columns.get(name)
            return cells[position] if position is not None and position < len(cells) else ""

        name = clean_name(cell("Название"))
        buyin_raw = cell("BUY-IN")
        if not name or buyin_raw in {"-", "—"}:
            continue
        if section == "series" and one_off is not None and one_off < today:
            continue
        rows_total += 1

        if weekday is None or (section == "series" and one_off is None):
            issues.append(ParseIssue(row=index, message=f"{name}: строка без дня"))
            continue
        buyin = parse_chips(buyin_raw)
        if buyin is None:
            issues.append(ParseIssue(row=index, message=f"{name}: не разобран бай-ин"))
            continue

        notes: list[str] = []
        guarantee_raw = cell("Гарантия")
        guarantee = parse_chips(guarantee_raw)
        if guarantee is None and normalize_name(guarantee_raw) not in _EMPTY:
            notes.append(f"Гарантия: {normalize_name(guarantee_raw)}")
        promo = _text(cell("АКЦИЯ"))
        if promo:
            notes.append(promo)

        late_match = _FIRST_INT.search(cell("LATE REG"))
        late_reg_levels = int(late_match.group(1)) if late_match else None
        level_minutes = _text(cell("MINUTES"))
        early_bird = _EARLY_BIRD_PLACES.search(cell("EARLY BIRD"))
        game_type, bounty_kind = classify_game(name, name)
        start_time = time(minutes // 60, minutes % 60)
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
            guarantee=guarantee,
            rebuy_terms=_text(cell("REBUYS")),
            addon_terms=_text(cell("ADD-ONS")),
            start_stack=_int(cell("STACK")),
            late_reg_levels=late_reg_levels,
            level_minutes=level_minutes,
            structure=_structure(cell("STRUCTURE")),
            early_bird_players=int(early_bird.group(1)) if early_bird else None,
            satellite_target=satellite_target(name),
            notes="; ".join(notes) or None,
            weekdays=[weekday],
            start_time=start_time,
            late_reg_close_offset_min=offset,
            valid_from=one_off if section == "series" else None,
            valid_until=one_off if section == "series" else None,
        )
        key = tuple(value for field, value in draft.model_dump().items() if field != "weekdays")
        existing = groups.get(key)
        if existing is None:
            groups[key] = draft
        elif weekday in existing.weekdays:
            issues.append(ParseIssue(row=index, message=f"{name}: дубль в тот же день"))
        else:
            existing.weekdays = sorted({*existing.weekdays, weekday})

    _infer_ticket_values(list(groups.values()))
    if headers_seen == 0:
        raise ProstoSheetError("Не найдена шапка «Старт, Гарантия, Название, BUY-IN»")
    templates = sorted(
        groups.values(),
        key=lambda item: (item.valid_from or date.min, item.start_time, item.name),
    )
    return TemplateParseResult(templates=templates, issues=issues, rows_total=rows_total)
