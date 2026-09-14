"""Сетка клуба, заведённая вручную, — наш собственный CSV.

Для союзов, которые публикуют расписание картинкой (Poker21, Black Sea): человек переносит
неделю в таблицу, импорт превращает её в шаблоны. Та же схема, что у NUTS: предпросмотр,
затем применение; повторный импорт следующей недели заменяет сетку.

Колонки (порядок любой, лишние игнорируются; обязательны time, name, buyin и days или date):

    days      пн,ср,пт · ежедневно · будни · выходные ·
              турнир месяца: «2-е вс», «второе воскресенье», «последнее вс»
    date      разовое событие: 2026-09-15 · 15.09.2026 · 15.09 (год — ближайший);
              если заполнена, days не нужны
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
    rebuy_terms, addon_terms  условия словами: «20 000 фишек / x2 — 40 000», «есть»
    stack     стартовый стек
    max       игроков за столом
    structure структура: Deep Stack, Turbo…
    lobby_name        имя в лобби приложения — игрок видит его, name остаётся с афиши
    bounty_share      доля бай-ина в баунти: «50» или как в лобби Poker21 — «1/2»
    early_bird_bonus  бонус Early Bird: «+50% фишек»
    early_bird_levels до конца какого уровня действует бонус: 1
    jackpot           да — турнир участвует в джекпоте
    notes     заметка
"""

from __future__ import annotations

import csv
import io
from collections import OrderedDict
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.models.enums import BountyKind, GameType
from app.schemas.tournaments import ParseIssue, TemplateDraft, TemplateParseResult
from app.services.tournaments.late_reg import late_reg_close_offset
from app.services.tournaments.nuts_csv import _decimal, _int, _minutes, _text, normalize_name
from app.services.tournaments.satellites import satellite_target

SOURCE = "manual-csv"
REQUIRED_COLUMNS = ("time", "name", "buyin")
# Плюс хотя бы одна из них: регулярная сетка или разовое событие.
SCHEDULE_COLUMNS = ("days", "date")

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
    return all(column in header for column in REQUIRED_COLUMNS) and any(
        column in header for column in SCHEDULE_COLUMNS
    )


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


_ORDINALS = {"перв": 1, "втор": 2, "трет": 3, "четв": 4, "пят": 5, "посл": -1}


def parse_monthly(value: str) -> tuple[int, int] | None:
    """«2-е вс» / «второе воскресенье» / «последнее вс» → (день недели ISO, неделя месяца)."""
    words = value.strip().lower().replace("ё", "е").split()
    if len(words) != 2:
        return None
    first, day_word = words
    week: int | None = None
    digits = "".join(ch for ch in first if ch.isdigit())
    if digits:
        week = int(digits)
    else:
        week = next((n for prefix, n in _ORDINALS.items() if first.startswith(prefix)), None)
    day = _DAY_TOKENS.get(day_word[:2]) or _FULL_DAY_PREFIXES.get(day_word[:3])
    if week is None or day is None or week not in (-1, 1, 2, 3, 4, 5):
        return None
    return day, week


def parse_date(value: str, today: date) -> date | None:
    """«2026-09-15», «15.09.2026» или «15.09». Без года — ближайшая такая дата не старше недели
    назад: сетку заводят заранее, и «15.01» в декабре — это январь следующего года."""
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        if "-" in cleaned:
            return date.fromisoformat(cleaned)
        parts = [int(part) for part in cleaned.split(".") if part]
        if len(parts) == 3:
            year = parts[2] + 2000 if parts[2] < 100 else parts[2]
            return date(year, parts[1], parts[0])
        if len(parts) == 2:
            candidate = date(today.year, parts[1], parts[0])
            if (today - candidate).days > 7:
                candidate = date(today.year + 1, parts[1], parts[0])
            return candidate
    except ValueError:
        return None
    return None


def _share(value: str) -> int | None:
    """Доля баунти в бай-ине, %: «50», «50%» или как в лобби Poker21 — «1/2»."""
    text = value.strip().rstrip("%").strip()
    if not text:
        return None
    try:
        if "/" in text:
            top, _, bottom = text.partition("/")
            share = round(int(top) * 100 / int(bottom))
        else:
            share = int(text)
    except (ValueError, ZeroDivisionError):
        return None
    return share if 0 < share <= 100 else None


def _flag(value: str) -> bool:
    return value.strip().lower() in {"1", "+", "да", "есть", "yes", "true"}


def parse_manual_csv(data: bytes, *, today: date | None = None) -> TemplateParseResult:
    if not looks_like_manual_csv(data):
        raise ManualCsvError(
            f"Нужны колонки: {', '.join(REQUIRED_COLUMNS)} и {' или '.join(SCHEDULE_COLUMNS)}"
        )
    today = today or datetime.now(ZoneInfo("Europe/Moscow")).date()
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
        one_off: date | None = None
        month_week: int | None = None
        days: list[int] | None
        if row.get("date"):
            one_off = parse_date(row["date"], today)
            if one_off is None:
                issues.append(
                    ParseIssue(row=index, message=f"{name}: не разобрана дата «{row['date']}»")
                )
                continue
            if one_off < today:
                issues.append(
                    ParseIssue(row=index, message=f"{name}: дата {one_off:%d.%m.%Y} уже прошла")
                )
                continue
            days = [one_off.isoweekday()]
        elif monthly := parse_monthly(row.get("days", "")):
            days = [monthly[0]]
            month_week = monthly[1]
        else:
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
            rebuy_terms=_text(row.get("rebuy_terms", "")),
            addon_cost=_decimal(row.get("addon", "")),
            addon_terms=_text(row.get("addon_terms", "")),
            start_stack=_int(row.get("stack", "")),
            table_size=_int(row.get("max", "")),
            structure=_text(row.get("structure", "")),
            lobby_name=_text(row.get("lobby_name", "")),
            bounty_share=_share(row.get("bounty_share", "")),
            early_bird_bonus=_text(row.get("early_bird_bonus", "")),
            early_bird_levels=_int(row.get("early_bird_levels", "")),
            has_jackpot=_flag(row.get("jackpot", "")),
            late_reg_levels=late_reg_levels,
            level_minutes=level_minutes,
            ticket_value=_decimal(row.get("ticket", "")),
            satellite_target=_text(row.get("target", "")) or satellite_target(name),
            early_bird_players=_int(row.get("early_bird", "")),
            notes=_text(row.get("notes", "")),
            weekdays=days,
            start_time=time(minutes // 60, start_minute),
            late_reg_close_offset_min=offset,
            valid_from=one_off,
            valid_until=one_off,
            month_week=month_week,
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
