from __future__ import annotations

import secrets

HAND_SLUG_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
HAND_SLUG_LENGTH = 10


def generate_hand_slug(*, length: int = HAND_SLUG_LENGTH) -> str:
    return "".join(secrets.choice(HAND_SLUG_ALPHABET) for _ in range(length))


def is_valid_hand_slug(value: str) -> bool:
    return len(value) == HAND_SLUG_LENGTH and all(ch in HAND_SLUG_ALPHABET for ch in value)
