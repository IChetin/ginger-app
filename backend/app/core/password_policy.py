"""Password strength checks without third-party deps."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_COMMON_FILE = Path(__file__).resolve().parent.parent / "data" / "common_passwords.txt"


@lru_cache(maxsize=1)
def load_common_passwords() -> frozenset[str]:
    if not _COMMON_FILE.is_file():
        return frozenset()
    lines = _COMMON_FILE.read_text(encoding="utf-8").splitlines()
    return frozenset(line.strip().lower() for line in lines if line.strip())


def is_common_password(password: str) -> bool:
    return password.lower() in load_common_passwords()
