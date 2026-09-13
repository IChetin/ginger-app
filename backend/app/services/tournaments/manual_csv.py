"""Сетка клуба, заведённая вручную, — наш собственный CSV.

Для союзов, которые публикуют расписание картинкой (Poker21, Black Sea): человек переносит
неделю в таблицу, импорт превращает её в шаблоны. Та же схема, что у NUTS: предпросмотр,
затем применение; повторный импорт следующей недели заменяет сетку.

Колонки (порядок любой, лишние игнорируются; обязательны days, time, name, buyin):

    days      пн,ср,пт · ежедневно · будни · выходные
    time      18:00 — по МСК
    name      название, как увидит игрок
    game      NLH (по умолчанию) · PLO · PLO5 · другое
    bounty    PKO · KO · MKO / Mystery · пусто
    buyin     бай-ин в фишках клуба
    guarantee гарантия в фишках
    ticket    номинал билета у сателлита
    target    на какой турнир ведёт сателлит (иначе берётся из названия: «X SAT», «Sat to X»)
    early_bird сколько первых регистраций получают бонус
    late_reg  уровней поздней регистрации
    minutes   длительность уровней, «15/12/12»
    addon     стоимость аддона
    rebuy     стоимость ребая
    notes     заметка
"""

from __future__ import annotations

import csv
import io
from collections import OrderedDict
from datetime import time

from app.models.enums import BountyKind, GameType
from app.schemas.tournaments import ParseIssue, TemplateDraft, TemplateParseResult
from app.services.tournaments.late_reg import late_reg_close_offset
from app.services.tournaments.nuts_csv import _decimal, _int, _minutes, _text, normalize_name
from app.services.tournaments.satellites import satellite_target

SOURCE = "manual-csv"
REQUIRED_COLUMNS = ("days", "time", "name", "buyin")

_DAY_TOKENS = {
    "пн": 1,
    "вт": 2,
    "ср": 3,
    "чт": 4,
    "пт": 5,
    "сб": 6,
    "вс": 7,
}
_FULL_DAY_PREFIXES = {"суб": 6, "вос": 7}
_DAY_GROUPS = {
    "ежедневно": [1, 2, 3, 4, 5, 6, 7],
    "каждый день": [1, 2, 3, 4, 5, 6, 7],
    "будни": [1, 2, 3, 4, 5],
    "выходные": [6, 7],
}
_GAMES = {"nlh": GameType.NLH, "plo": GameType.PLO, "plo4": GameType.PLO, "plo5": GameType.PLO5}
_BOUNTIES = {
    "pko": BountyKind.PKO,
    "ko": BountyKind.KO,
    "mko": BountyKind.MYSTERY,
    "mystery": BountyKind.MYSTERY,
}


class ManualCsvError(ValueError):
    """Файл не похож на ручную сетку."""


def looks_like_manual_csv(data: bytes) -> bool:
    try:
        first_line = data.decode("utf-8-sig").lstrip().splitlines()[0]
    except (UnicodeDecodeError, IndexError):
        return False
    header = {cell.strip().lower() for cell in next(csv.reader([first_line]))}
    return all(column in header for column in REQUIRED_COLUMNS)


def parse_days(value: str) -> list[int] | None:
    cleaned = value.strip().lower()
    if cleaned in _DAY_GROUPS:
        return list(_DAY_GROUPS[cleaned])
    days: set[int] = set()
    for token in cleaned.replace(";", ",").replace(" ", ",").split(","):
        if not token:
            continue
        # «пн» или полное «понедельник»: сокращения совпадают с началом слова, кроме субботы
        # и воскресенья («су…», «во…»).
        day = _DAY_TOKENS.get(token[:2]) or _FULL_DAY_PREFIXES.get(token[:3])
        if day is None:
            return None
        days.add(day)
    return sorted(days) or None


def parse_manual_csv(data: bytes) -> TemplateParseResult:
    if not looks_like_manual_csv(data):
        raise ManualCsvError(f"Нужны колонки: {', '.join(REQUIRED_COLUMNS)}")
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    issues: list[ParseIssue] = []
    groups: OrderedDict[tuple[object, ...], TemplateDraft] = OrderedDict()
    rows_total = 0

    for index, raw in enumerate(reader, start=2):
        row = {(key or "").strip().lower(): (value or "").strip() for key, value in raw.items()}
        name = normalize_name(row.get("name", ""))
        if not name:
            continue
        rows_total += 1
        days = parse_days(row.get("days", ""))
        minutes = _minutes(row.get("time", ""))
        buyin = _decimal(row.get("buyin", ""))
        if days is None:
            issues.append(
                ParseIssue(row=index, message=f"{name}: не разобраны дни «{row['days']}»")
            )
            continue
        if minutes is None:
            issues.append(ParseIssue(row=index, message=f"{name}: не разобрано время"))
            continue
        if buyin is None:
            issues.append(ParseIssue(row=index, message=f"{name}: не разобран бай-ин"))
            continue

        game_key = row.get("game", "").lower().replace(" ", "")
        game_type = _GAMES.get(game_key, GameType.NLH if not game_key else GameType.OTHER)
        bounty_key = row.get("bounty", "").lower()
        if bounty_key and bounty_key not in _BOUNTIES:
            issues.append(
                ParseIssue(row=index, message=f"{name}: неизвестный баунти «{bounty_key}»")
            )
            continue
        late_reg_levels = _int(row.get("late_reg", ""))
        level_minutes = _text(row.get("minutes", ""))
        start_minute = minutes % 60
        offset = (
            late_reg_close_offset(start_minute, late_reg_levels, level_minutes)
            if late_reg_levels
            else None
        )
        draft = TemplateDraft(
            name=name,
            game_type=game_type,
            bounty_kind=_BOUNTIES.get(bounty_key, BountyKind.NONE),
            buyin=buyin,
            guarantee=_decimal(row.get("guarantee", "")),
            rebuy_cost=_decimal(row.get("rebuy", "")),
            addon_cost=_decimal(row.get("addon", "")),
            late_reg_levels=late_reg_levels,
            level_minutes=level_minutes,
            ticket_value=_decimal(row.get("ticket", "")),
            satellite_target=_text(row.get("target", "")) or satellite_target(name),
            early_bird_players=_int(row.get("early_bird", "")),
            notes=_text(row.get("notes", "")),
            weekdays=days,
            start_time=time(minutes // 60, start_minute),
            late_reg_close_offset_min=offset,
        )
        key = tuple(value for field, value in draft.model_dump().items() if field != "weekdays")
        existing = groups.get(key)
        if existing is None:
            groups[key] = draft
            continue
        overlap = set(existing.weekdays) & set(days)
        if overlap:
            issues.append(ParseIssue(row=index, message=f"{name}: дубль в тот же день"))
            continue
        existing.weekdays = sorted(set(existing.weekdays) | set(days))

    templates = sorted(groups.values(), key=lambda item: (item.start_time, item.name))
    return TemplateParseResult(templates=templates, issues=issues, rows_total=rows_total)
