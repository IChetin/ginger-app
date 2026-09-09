"""Nickname validation — single source of truth for backend rules."""

from __future__ import annotations

NICKNAME_LENGTH_MSG = "От 2 до 32 символов"
NICKNAME_DIGITS_MSG = "Ник не может состоять только из цифр"
NICKNAME_TAKEN_MSG = "Ник занят"

NICKNAME_MIN_LEN = 2
NICKNAME_MAX_LEN = 32


def normalize_nickname_key(value: str) -> str:
    """Casefold key for uniqueness comparison (store original separately)."""
    return value.casefold()


def validate_nickname(value: str) -> str:
    """Strip and validate; return original casing. Raises ValueError with RU message.

    Any Unicode is allowed (letters, spaces, punctuation, emoji). Constraints:
    length 2–32 after strip, and not digits-only.
    """
    cleaned = value.strip()
    if len(cleaned) < NICKNAME_MIN_LEN or len(cleaned) > NICKNAME_MAX_LEN:
        raise ValueError(NICKNAME_LENGTH_MSG)
    if cleaned.isdigit():
        raise ValueError(NICKNAME_DIGITS_MSG)
    return cleaned
