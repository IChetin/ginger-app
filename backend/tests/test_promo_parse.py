# ruff: noqa: E501 — посты и афиши вставлены как есть, с длинными строками.
"""Разбор акций на примерах Ивана (30.09): пост союза, афиша Poker21 и скрин лобби."""

from datetime import datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from app.services.promo_parse import MSK, ClubRef, add_month, parse_promo

GINGER = ClubRef(uuid4(), "Ginger", "NUTS", "USDT")
GINGER21 = ClubRef(uuid4(), "Ginger21", "Poker21", "RUB")
PRIVATE_G = ClubRef(uuid4(), "Private.G", "Просторы Покера", "RUB")
CLUBS = [GINGER, GINGER21, PRIVATE_G]
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=MSK)

PROSTORY_POST = """⚡️ С 1 октября в союзе «Просторы покера» стартует новый месячный LEADERBOARD! ⚡️

Показывайте результат, участвуйте в турнирах МТТ, попадайте в призы и поднимайтесь на вершину рейтинга 🏆

🚀 Как всё работает?
Участвуете → попадаете в призы → побеждаете в турнирах → зарабатываете очки и двигаетесь вверх по LEADERBOARD.

🔥 10 лучших МТТ-игроков месяца автоматически получают призы:
🥇 1 место — 50 000 ₽
🥈 2 место — 40 000 ₽
🥉 3 место — 31 000 ₽
4 место — 24 000 ₽
5 место — 18 000 ₽
6 место — 14 000 ₽
7 место — 10 000 ₽
8 место — 7 000 ₽
9 место — 5 000 ₽
10 место — 🖤 Black VIP Card

⚡️ Новый месяц — новый шанс забрать свой приз!
Участвуйте. Побеждайте. Поднимайтесь в LEADERBOARD🏆
"""

# Так Tesseract читает афишу Poker21 PLUS: строки по блокам, ₽ на месте.
POKER21_POSTER = """POKER21 PLUS
LEADERBOARD MTT
Призовой фонд
610 000 ₽
Участвуют турниры с buy-in от 500 ₽ до 10 000 ₽
Старт
28.09 в 10:00 МСК
Финиш
28.12 в 06:00 МСК
Двойные баллы каждый день
с 10:00 до 12:00 МСК
7 призовых мест
1 — 250 000 ₽
2 — 150 000 ₽
3 — 100 000 ₽
4 — 50 000 ₽
5 — 30 000 ₽
6 — 20 000 ₽
7 — 10 000 ₽
"""

POKER21_LOBBY = """BOARD SCORE
Награды
00,090,000
09-28 14:00 - 12-28 10:00
двойной: 14:00 - 16:00
🏆MTT Мини Чемп🏆
Нет описания
Бай-ин Диапазон: 10 - 400
Режим игры: MTT
Рейтинг Интеграция Премия
1 - 50000
2 - 25000
3 - 10000
4 - 5000
Poker21 Норм
"""


def test_union_post_becomes_monthly_leaderboard_of_our_club() -> None:
    promo = parse_promo(PROSTORY_POST, CLUBS, NOW)

    # Игрок видит клуб, а не союз: «Просторы покера» — это наш Private.G.
    assert promo.club_id == PRIVATE_G.id
    assert promo.kind == "leaderboard"
    assert promo.recurrence == "monthly"
    assert promo.game == "mtt"
    assert promo.title == "Месячный Leaderboard MTT"
    assert promo.starts_at == datetime(2026, 10, 1, tzinfo=MSK)
    assert promo.ends_at == datetime(2026, 11, 1, tzinfo=MSK)
    assert len(promo.prizes) == 10
    assert promo.prizes[0].amount == Decimal("50000")
    assert promo.prizes[9].label == "Black VIP Card"
    assert promo.prize_extra == "Black VIP Card"
    assert promo.prize_fund == Decimal("199000")
    assert promo.currency_code == "RUB"
    # Название придумано, конец месяца выведен, времени в посте нет — проверить глазами.
    assert {"title", "ends_at", "starts_at"} <= set(promo.uncertain)
    assert "club_id" not in promo.uncertain


def test_poster_with_msk_dates_needs_no_checks() -> None:
    promo = parse_promo(POKER21_POSTER, CLUBS, NOW)

    assert promo.club_id == GINGER21.id
    assert promo.title == "Leaderboard MTT"
    assert promo.prize_fund == Decimal("610000")
    assert promo.currency_code == "RUB"
    assert promo.starts_at == datetime(2026, 9, 28, 10, 0, tzinfo=MSK)
    assert promo.ends_at == datetime(2026, 12, 28, 6, 0, tzinfo=MSK)
    assert (promo.buyin_min, promo.buyin_max) == (Decimal("500"), Decimal("10000"))
    assert promo.boost_windows == [{"start": "10:00", "end": "12:00", "multiplier": 2}]
    assert [prize.amount for prize in promo.prizes] == [
        Decimal(value)
        for value in ("250000", "150000", "100000", "50000", "30000", "20000", "10000")
    ]
    assert promo.recurrence == "none"
    assert promo.uncertain == []


def test_lobby_screenshot_flags_app_time_and_currency() -> None:
    promo = parse_promo(POKER21_LOBBY, CLUBS, NOW)

    assert promo.club_id == GINGER21.id
    assert promo.title == "MTT Мини Чемп"
    assert promo.prize_fund == Decimal("90000")
    assert [prize.amount for prize in promo.prizes] == [
        Decimal("50000"),
        Decimal("25000"),
        Decimal("10000"),
        Decimal("5000"),
    ]
    assert (promo.buyin_min, promo.buyin_max) == (Decimal("10"), Decimal("400"))
    assert promo.starts_at == datetime(2026, 9, 28, 14, 0, tzinfo=MSK)
    assert promo.ends_at == datetime(2026, 12, 28, 10, 0, tzinfo=MSK)
    # Время в лобби — в поясе приложения, валюты нет: подставлена валюта клуба.
    assert promo.currency_code == "RUB"
    assert {"starts_at", "ends_at", "currency_code", "boost_windows"} <= set(promo.uncertain)


def test_unknown_union_leaves_club_empty() -> None:
    promo = parse_promo("Фриролл 5 октября в 20:00 МСК, фонд 10 000 ₽", CLUBS, NOW)

    assert promo.kind == "freeroll"
    assert promo.club_id is None
    assert "club_id" in promo.uncertain
    assert promo.starts_at == datetime(2026, 10, 5, 20, 0, tzinfo=MSK)


def test_longer_club_name_wins() -> None:
    promo = parse_promo("Leaderboard в клубе Ginger21: 1 место — 1 000 ₽", CLUBS, NOW)
    assert promo.club_id == GINGER21.id


def test_add_month_keeps_day_or_clamps() -> None:
    assert add_month(datetime(2026, 10, 1, tzinfo=MSK)) == datetime(2026, 11, 1, tzinfo=MSK)
    assert add_month(datetime(2027, 1, 31, 6, 0, tzinfo=MSK)) == datetime(
        2027, 2, 28, 6, 0, tzinfo=MSK
    )
    assert add_month(datetime(2026, 12, 28, tzinfo=MSK)) == datetime(2027, 1, 28, tzinfo=MSK)


FIXTURES = Path(__file__).parent / "fixtures"


def test_real_ocr_of_poker21_poster_parses_fully() -> None:
    """Вывод Tesseract на проде по настоящей афише (4 прохода): «₽» стал «Р/P», мусор вокруг."""
    text = (FIXTURES / "promo_ocr_poker21_poster.txt").read_text(encoding="utf-8")
    promo = parse_promo(text, CLUBS, NOW, from_image=True)

    assert promo.club_id == GINGER21.id
    assert promo.title == "Leaderboard MTT"
    assert promo.prize_fund == Decimal("610000")
    assert promo.currency_code == "RUB"
    assert (promo.buyin_min, promo.buyin_max) == (Decimal("500"), Decimal("10000"))
    assert promo.starts_at == datetime(2026, 9, 28, 10, 0, tzinfo=MSK)
    assert promo.ends_at == datetime(2026, 12, 28, 6, 0, tzinfo=MSK)
    assert promo.boost_windows == [{"start": "10:00", "end": "12:00", "multiplier": 2}]
    assert sum(prize.amount or 0 for prize in promo.prizes) == Decimal("610000")
    assert promo.uncertain == []


def test_real_ocr_of_lobby_screenshot_flags_what_was_lost() -> None:
    """Скрин лобби: фонд со счётчика, призы, бай-ин, даты и x2; клуб и валюту — проверить."""
    text = (FIXTURES / "promo_ocr_poker21_lobby.txt").read_text(encoding="utf-8")
    promo = parse_promo(text, CLUBS, NOW, from_image=True)

    assert (promo.buyin_min, promo.buyin_max) == (Decimal("10"), Decimal("400"))
    assert promo.starts_at == datetime(2026, 9, 28, 14, 0, tzinfo=MSK)
    assert promo.ends_at == datetime(2026, 12, 28, 10, 0, tzinfo=MSK)
    assert promo.prize_fund == Decimal("90000")
    assert [prize.amount for prize in promo.prizes] == [
        Decimal("50000"),
        Decimal("25000"),
        Decimal("10000"),
        Decimal("5000"),
    ]
    # Мусорный «$» с картинки долларом не считаем — валюту подтверждает человек.
    assert promo.currency_code is None
    assert {"club_id", "currency_code", "starts_at", "ends_at"} <= set(promo.uncertain)
    assert "prize_fund" not in promo.uncertain
