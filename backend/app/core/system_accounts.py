"""Системные пользователи — служебные аккаунты, скрытые из списков, подсчётов и входа.

В базе Day2 единственным таким был демо-автор раздач; он удалён вместе с реплеером.
Механизм оставлен: пригодится, например, для системного автора записей в ленте событий.
Чтобы завести системного пользователя — добавить его id и email в наборы ниже.
"""

from uuid import UUID

from app.core.email import normalize_email

SYSTEM_USER_IDS: frozenset[UUID] = frozenset()
SYSTEM_USER_EMAILS: frozenset[str] = frozenset()


def is_system_user_email(email: str) -> bool:
    return normalize_email(email) in SYSTEM_USER_EMAILS


def is_system_user_id(user_id: UUID) -> bool:
    return user_id in SYSTEM_USER_IDS
