"""Nickname validation unit tests + rule fixtures shared with frontend parity."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.nickname import (
    NICKNAME_DIGITS_MSG,
    NICKNAME_LENGTH_MSG,
    normalize_nickname_key,
    validate_nickname,
)
from app.schemas.auth import UpdateMeBody

# Keep in sync with frontend/src/lib/nickname.test.ts (parity cases).
VALID_NICKNAMES = (
    "Ваня_МТТ",
    "alex-grinder",
    "Игрок2026",
    "ab",
    "a_b-c",
    "Ваня",
    "Ёжик",
    "Player_1",
    "ваня петров",
    "ник😀",
    "pro.player",
    "nick name",
    "♠A♥",
)

INVALID_NICKNAMES: tuple[tuple[str, str], ...] = (
    ("1234", NICKNAME_DIGITS_MSG),
    ("a", NICKNAME_LENGTH_MSG),
    ("x" * 33, NICKNAME_LENGTH_MSG),
    ("", NICKNAME_LENGTH_MSG),
)


@pytest.mark.parametrize("nickname", VALID_NICKNAMES)
def test_validate_nickname_accepts(nickname: str) -> None:
    assert validate_nickname(nickname) == nickname


@pytest.mark.parametrize(("nickname", "message"), INVALID_NICKNAMES)
def test_validate_nickname_rejects(nickname: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        validate_nickname(nickname)


def test_casefold_keys_collide() -> None:
    assert normalize_nickname_key("Ваня") == normalize_nickname_key("ваня")
    assert normalize_nickname_key("Alex") == normalize_nickname_key("ALEX")


def test_update_me_body_uses_shared_validator() -> None:
    body = UpdateMeBody(nickname="Ваня_МТТ")
    assert body.nickname == "Ваня_МТТ"
    with pytest.raises(ValidationError) as exc:
        UpdateMeBody(nickname="1234")
    assert NICKNAME_DIGITS_MSG in str(exc.value)


def test_strips_surrounding_whitespace() -> None:
    assert validate_nickname("  Ваня  ") == "Ваня"
