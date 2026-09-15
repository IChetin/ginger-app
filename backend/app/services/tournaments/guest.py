"""Что видит гость без входа (решение Ивана 15.09: защита базы от копирования).

Гость — ближайшие 24 часа расписания и только строку турнира: время, название, бай-ин,
гарантия, формат. Детали (стек, уровни, ребаи, Early Bird…), Editor's Pick, диплинки,
LIVE и сателлиты — после входа. Сервер режет сам: фронту верить нельзя.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.schemas.cash import CashGameRead
from app.schemas.tournaments import TournamentRead

GUEST_WINDOW = timedelta(hours=24)

# satellite_target остаётся: по нему фронт убирает сателлиты из списка.
_TOURNAMENT_DETAILS = (
    "rebuy_cost",
    "rebuy_terms",
    "addon_cost",
    "addon_terms",
    "start_stack",
    "table_size",
    "late_reg_levels",
    "level_minutes",
    "structure",
    "ticket_value",
    "early_bird_players",
    "bounty_share",
    "early_bird_bonus",
    "early_bird_levels",
    "early_bird_closes_at",
    "notes",
    "app_link",
    "editor_pick_note",
)


def guest_range(requested_to: datetime, now: datetime) -> tuple[datetime, datetime]:
    """Гостю окно всегда от «сейчас» и не дальше суток: иначе неделю выкачают по одному дню."""
    return now, min(requested_to, now + GUEST_WINDOW)


def tournaments_for_guest(items: list[TournamentRead]) -> list[TournamentRead]:
    hidden: dict[str, object] = {field: None for field in _TOURNAMENT_DETAILS}
    hidden.update(is_editor_pick=False, has_jackpot=False)
    return [item.model_copy(update=hidden) for item in items]


def cash_for_guest(items: list[CashGameRead]) -> list[CashGameRead]:
    hidden = {"is_editor_pick": False, "editor_pick_note": None, "app_link": None}
    return [item.model_copy(update=hidden) for item in items]
