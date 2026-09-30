"""Разбор акции из текста поста или распознанной картинки (Иван, 30.09).

Без платных сервисов: союзы пишут условия по шаблону — «1 место — 50 000 ₽», «Старт
28.09 в 10:00 МСК», «двойные баллы с 10:00 до 12:00», и это ловится регулярками. Всё,
в чём разборщик не уверен (время без «МСК», валюта не указана, клуб не найден), попадает
в `uncertain` — в админке это поле подсвечено «проверить». Публикует всегда человек.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")

MONTHS = {
    "январ": 1,
    "феврал": 2,
    "март": 3,
    "апрел": 4,
    "ма": 5,
    "июн": 6,
    "июл": 7,
    "август": 8,
    "сентябр": 9,
    "октябр": 10,
    "ноябр": 11,
    "декабр": 12,
}
_MONTH_WORD = (
    r"(январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|"
    r"сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])"
)
# «610 000», «10 000», «50000», «5.000» — группы тысяч через пробел, точку или запятую.
_NUMBER = r"\d{1,3}(?:[ .,]\d{3})+|\d+"
_CURRENCY = r"₽|руб\.?|р\.|\bр\b|\bp\b|\bр$|\$|usdt|usd|€"


@dataclass(frozen=True)
class ClubRef:
    """Клуб, к которому можно привязать акцию: игрок видит клуб, а не союз."""

    id: UUID
    name: str
    organizer_name: str | None
    currency_code: str | None


@dataclass
class ParsedPrize:
    place: int
    amount: Decimal | None = None
    label: str | None = None


@dataclass
class ParsedPromo:
    title: str = "Leaderboard"
    kind: str = "leaderboard"
    club_id: UUID | None = None
    prize_fund: Decimal | None = None
    prize_extra: str | None = None
    currency_code: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    recurrence: str = "none"
    game: str = "mtt"
    buyin_min: Decimal | None = None
    buyin_max: Decimal | None = None
    prizes: list[ParsedPrize] = field(default_factory=list)
    boost_windows: list[dict[str, object]] = field(default_factory=list)
    uncertain: list[str] = field(default_factory=list)

    def doubt(self, name: str) -> None:
        if name not in self.uncertain:
            self.uncertain.append(name)


def _normalize(text: str) -> str:
    text = text.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    text = re.sub(r"[‐‑‒–—―−]", "—", text)
    text = text.replace("ё", "е").replace("Ё", "Е")
    return text


def _money(raw: str) -> Decimal:
    digits = re.sub(r"[ .,]", "", raw)
    return Decimal(digits)


def _clean_label(raw: str) -> str:
    # Эмодзи и декоративные символы по краям — «🖤 Black VIP Card» → «Black VIP Card».
    cleaned = re.sub(r"^[^\wА-Яа-я]+|[^\wА-Яа-я)]+$", "", raw.strip())
    return cleaned.strip()


def _currency(text: str) -> str | None:
    lowered = text.lower()
    if "usdt" in lowered:
        return "USDT"
    if "₽" in text or re.search(r"\bруб", lowered):
        return "RUB"
    if "$" in text or re.search(r"\busd\b", lowered):
        return "USD"
    if "€" in text:
        return "EUR"
    return None


def _prizes(lines: list[str]) -> list[ParsedPrize]:
    """Строки вида «🥇 1 место — 50 000 ₽», «1 — 250 000 ₽», «10 место — 🖤 Black VIP Card»."""
    found: dict[int, ParsedPrize] = {}
    pattern = re.compile(
        r"^\W*?(\d{1,2})\s*(?:-?(?:е|й|ое))?\s*(?:место|мест[оа]|м\.)?\s*[—\-:=]\s*(.+?)\s*$",
        re.IGNORECASE,
    )
    for line in lines:
        match = pattern.match(line)
        if match is None:
            continue
        place = int(match.group(1))
        value = match.group(2)
        if place < 1 or place > 100 or place in found:
            continue
        # После суммы допускаем пару букв мусора: распознанный «₽» бывает «Р», «P», «в».
        amount = re.match(rf"^\W*({_NUMBER})\s*[^\d\s]{{0,3}}\W*$", value, re.IGNORECASE)
        if amount:
            found[place] = ParsedPrize(place=place, amount=_money(amount.group(1)))
        else:
            label = _clean_label(value)
            # Подпись приза — со словами: «28 14:00 - 12-28» из строки дат призом не считаем.
            if label and re.search(r"[A-Za-zА-Яа-я]", label):
                found[place] = ParsedPrize(place=place, label=label[:60])
    # Места идут подряд с первого: «2 — 14:00» из расписания — не приз.
    prizes: list[ParsedPrize] = []
    for place in range(1, 101):
        if place not in found:
            break
        prizes.append(found[place])
    return prizes


def _unnumbered_prizes(lines: list[str], fund: Decimal | None) -> list[ParsedPrize]:
    """С картинки номера мест теряются: «— 250 000 P», «— 150 000 Р» подряд после «призов…».

    Берём суммы по убыванию в порядке строк — места 1, 2, 3…; повтор той же суммы
    (второй проход распознавания) пропускаем.
    """
    start = next(
        (index for index, line in enumerate(lines) if re.search(r"призов", line, re.IGNORECASE)),
        None,
    )
    if start is None:
        return []
    amounts: list[Decimal] = []
    for line in lines[start + 1 :]:
        match = re.match(rf"^\W*({_NUMBER})\s*[^\d\s]{{0,3}}\W*$", line)
        if match is None:
            continue
        value = _money(match.group(1))
        # Сам фонд стоит рядом с «Призовой фонд» — это не приз за место.
        if value < 100 or (fund is not None and value >= fund):
            continue
        if amounts and value >= amounts[-1]:
            break
        amounts.append(value)
    if len(amounts) < 2:
        return []
    return [ParsedPrize(place=index + 1, amount=value) for index, value in enumerate(amounts)]


def _ocr_cleanup(text: str) -> str:
    """Типичные ошибки распознавания в числах: «G10 000» → «610 000», «10 000 P» → «10 000 ₽»."""
    text = re.sub(r"(?<![A-Za-z])G(?=\d)", "6", text)
    text = re.sub(r"(\d)\s?[PРр](?![A-Za-zА-Яа-я])", r"\1 ₽", text)
    return re.sub(r"\bMCK\b", "МСК", text)


def _nearest_year(month: int, day: int, now: datetime) -> int:
    """Год без подписи — ближайший к сегодняшнему: афиши живут месяцы, не годы."""
    candidates = []
    for year in (now.year - 1, now.year, now.year + 1):
        try:
            candidates.append(datetime(year, month, day, tzinfo=MSK))
        except ValueError:
            continue
    best = min(candidates, key=lambda moment: abs((moment - now).total_seconds()))
    return best.year


@dataclass
class _Moment:
    at: datetime
    explicit_msk: bool
    app_format: bool
    position: int


def _moments(text: str, now: datetime) -> list[_Moment]:
    moments: list[_Moment] = []
    # «28.09 в 10:00 МСК», «28.09.2026 10:00», «28.12 в 06:00»
    for match in re.finditer(
        r"(?<![\d:])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s*(?:в|,)?\s*(\d{1,2}):(\d{2}))?"
        r"(\s*(?:мск|msk))?",
        text,
        re.IGNORECASE,
    ):
        day, month = int(match.group(1)), int(match.group(2))
        if not (1 <= day <= 31 and 1 <= month <= 12):
            continue
        year = int(match.group(3)) if match.group(3) else _nearest_year(month, day, now)
        if year < 100:
            year += 2000
        hour = int(match.group(4)) if match.group(4) else 0
        minute = int(match.group(5)) if match.group(5) else 0
        try:
            at = datetime(year, month, day, hour, minute, tzinfo=MSK)
        except ValueError:
            continue
        moments.append(_Moment(at, bool(match.group(6)), False, match.start()))
    # Лобби приложений: «09-28 14:00» — месяц-день, время в поясе приложения.
    for match in re.finditer(r"(?<!\d)(\d{2})[—\-](\d{2})\s+(\d{1,2}):(\d{2})", text):
        month, day = int(match.group(1)), int(match.group(2))
        if not (1 <= day <= 31 and 1 <= month <= 12):
            continue
        try:
            at = datetime(
                _nearest_year(month, day, now),
                month,
                day,
                int(match.group(3)),
                int(match.group(4)),
                tzinfo=MSK,
            )
        except ValueError:
            continue
        moments.append(_Moment(at, False, True, match.start()))
    # «С 1 октября», «до 31 октября 23:59»
    for match in re.finditer(
        rf"(?<!\d)(\d{{1,2}})\s+{_MONTH_WORD}(?:\s+(\d{{4}}))?(?:\s*(?:в\s*)?(\d{{1,2}}):(\d{{2}}))?",
        text,
        re.IGNORECASE,
    ):
        word = match.group(2).lower()
        month = next(num for stem, num in MONTHS.items() if word.startswith(stem))
        day = int(match.group(1))
        year = int(match.group(3)) if match.group(3) else _nearest_year(month, day, now)
        hour = int(match.group(4)) if match.group(4) else 0
        minute = int(match.group(5)) if match.group(5) else 0
        try:
            at = datetime(year, month, day, hour, minute, tzinfo=MSK)
        except ValueError:
            continue
        moments.append(_Moment(at, False, False, match.start()))
    moments.sort(key=lambda item: item.position)
    return moments


def add_month(moment: datetime) -> datetime:
    local = moment.astimezone(MSK)
    year, month = (local.year + 1, 1) if local.month == 12 else (local.year, local.month + 1)
    day = local.day
    while True:
        try:
            return local.replace(year=year, month=month, day=day)
        except ValueError:
            day -= 1


def _title(lines: list[str], kind: str, monthly: bool) -> tuple[str, bool]:
    """Название: строка в кубках «🏆МТТ Мини Чемп🏆», строка с LEADERBOARD или первая короткая."""
    for line in lines:
        if line.startswith("🏆"):
            cleaned = _clean_label(line.replace("🏆", " "))
            if 3 <= len(cleaned) <= 60:
                return cleaned, False
    for line in lines:
        match = re.search(r"leaderboard(?:\s+(mtt|мтт|cash|кэш))?", line, re.IGNORECASE)
        if match and len(_clean_label(line)) <= 40:
            suffix = f" {match.group(1).upper().replace('МТТ', 'MTT')}" if match.group(1) else ""
            return f"Leaderboard{suffix}", False
    if kind == "leaderboard":
        base = "Месячный Leaderboard" if monthly else "Leaderboard"
        mtt = any(re.search(r"\b(mtt|мтт)\b", line, re.IGNORECASE) for line in lines)
        return (f"{base} MTT" if mtt else base), True
    for line in lines:
        cleaned = _clean_label(line)
        if 3 <= len(cleaned) <= 60:
            return cleaned, True
    return "Акция", True


def _club(text: str, clubs: list[ClubRef]) -> tuple[ClubRef | None, bool]:
    """Клуб по названию союза или самого клуба; в союзе несколько наших — берём первый."""
    squashed = re.sub(r"[^a-zа-я0-9]", "", text.lower())

    def key(value: str) -> str:
        return re.sub(r"[^a-zа-я0-9]", "", value.lower().replace("ё", "е"))

    # Длинные имена первыми: «Ginger21» не должен достаться клубу «Ginger».
    for club in sorted(clubs, key=lambda item: -len(key(item.name))):
        if len(key(club.name)) >= 4 and key(club.name) in squashed:
            return club, False
    matches = [
        club
        for club in clubs
        if club.organizer_name
        and len(key(club.organizer_name)) >= 4
        and key(club.organizer_name) in squashed
    ]
    if matches:
        return matches[0], len(matches) > 1
    return None, True


def parse_promo(text: str, clubs: list[ClubRef], now: datetime | None = None) -> ParsedPromo:
    now = (now or datetime.now(UTC)).astimezone(MSK)
    text = _ocr_cleanup(_normalize(text))
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    lowered = text.lower()
    result = ParsedPromo()

    if re.search(r"фриролл|freeroll", lowered):
        result.kind = "freeroll"
    elif re.search(r"leaderboard|лидерборд|рейтинг", lowered):
        result.kind = "leaderboard"
    else:
        result.kind = "other"
    if re.search(r"\b(кэш|кеш|cash)\b", lowered) and not re.search(r"\b(mtt|мтт)\b", lowered):
        result.game = "cash"
    monthly = bool(re.search(r"месячн|каждый месяц|ежемесячн|новый месяц", lowered))
    result.recurrence = "monthly" if monthly else "none"
    result.title, title_unsure = _title(lines, result.kind, monthly)
    if title_unsure:
        result.doubt("title")

    club, club_unsure = _club(text, clubs)
    if club is not None:
        result.club_id = club.id
    if club_unsure:
        result.doubt("club_id")

    def total(prizes: list[ParsedPrize]) -> Decimal:
        return sum((prize.amount or Decimal(0) for prize in prizes), Decimal(0))

    fund = re.search(
        rf"(?:призов\w*\s+фонд\w*|фонд\w*|награды)\D{{0,30}}?({_NUMBER})", text, re.IGNORECASE
    )
    stated_fund = _money(fund.group(1)) if fund else None
    numbered = _prizes(lines)
    unnumbered = _unnumbered_prizes(lines, stated_fund)
    # С картинки номер места бывает съеден, а сумма искажена («2500008»): берём тот
    # вариант, что сходится с объявленным фондом.
    if stated_fund is not None and unnumbered and total(numbered) != stated_fund:
        if total(unnumbered) == stated_fund or not numbered:
            numbered = unnumbered
    elif not numbered and unnumbered:
        numbered = unnumbered
        result.doubt("prizes")
    result.prizes = numbered
    extras = [prize.label for prize in result.prizes if prize.label]
    if extras:
        result.prize_extra = extras[0]
    money_total = total(result.prizes)

    if stated_fund is not None:
        result.prize_fund = stated_fund
        if money_total and result.prize_fund != money_total:
            result.doubt("prize_fund")
            result.doubt("prizes")
    elif money_total:
        result.prize_fund = money_total
    else:
        result.doubt("prize_fund")

    currency = _currency(text)
    if currency is None:
        currency = club.currency_code if club else None
        result.doubt("currency_code")
    result.currency_code = currency

    buyin = re.search(
        rf"(?:buy-?in|бай-?ин)[^\d\n]{{0,25}}?({_NUMBER})\D{{0,8}}?(?:—|-|до)\s*({_NUMBER})",
        text,
        re.IGNORECASE,
    )
    if buyin:
        result.buyin_min, result.buyin_max = _money(buyin.group(1)), _money(buyin.group(2))

    boost = re.search(
        r"(?:двойн\w*|x2|х2)[^\d]{0,60}?(\d{1,2}):(\d{2})\s*(?:—|-|до)\s*(\d{1,2}):(\d{2})",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if boost:
        start = f"{int(boost.group(1)):02d}:{boost.group(2)}"
        end = f"{int(boost.group(3)):02d}:{boost.group(4)}"
        result.boost_windows = [{"start": start, "end": end, "multiplier": 2}]
        window_text = text[boost.start() : boost.end() + 12].lower()
        if "мск" not in window_text and "мск" not in lowered:
            result.doubt("boost_windows")

    # Несколько проходов распознавания повторяют даты: оставляем первое вхождение каждой,
    # а концом считаем первую дату позже начала.
    seen: set[datetime] = set()
    moments = []
    for moment in _moments(text, now):
        if moment.at not in seen:
            seen.add(moment.at)
            moments.append(moment)
    if len(moments) > 1:
        later = next((moment for moment in moments[1:] if moment.at > moments[0].at), None)
        moments = [moments[0], later] if later else moments[:1]
    if moments:
        result.starts_at = moments[0].at
        if len(moments) > 1:
            result.ends_at = moments[1].at
        elif monthly:
            result.ends_at = add_month(moments[0].at)
            result.doubt("ends_at")
        else:
            result.doubt("ends_at")
        # Время без «МСК» — в поясе приложения или вовсе без времени: проверить.
        if any(moment.app_format for moment in moments[:2]) or not (
            any(moment.explicit_msk for moment in moments[:2]) or "мск" in lowered
        ):
            result.doubt("starts_at")
            if result.ends_at is not None:
                result.doubt("ends_at")
    else:
        result.doubt("starts_at")
        result.doubt("ends_at")
    if result.starts_at and result.ends_at and result.ends_at <= result.starts_at:
        result.ends_at = result.starts_at + timedelta(days=30)
        result.doubt("ends_at")
    return result
