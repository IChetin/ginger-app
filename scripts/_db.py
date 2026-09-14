"""Shared helpers for scripts that talk to the local Ginger Postgres (dev contour)."""

from __future__ import annotations

import os
from urllib.parse import urlparse, urlunparse


def resolve_database_url() -> str:
    """Return an asyncpg DSN usable from the host.

    Accepts SQLAlchemy-style ``postgresql+asyncpg://…`` or plain ``postgresql://…``.
    Rewrites Docker hostname ``postgres`` → ``localhost`` when running outside compose.
    """
    raw = os.environ.get("DATABASE_URL") or os.environ.get("E2E_DATABASE_URL")
    if not raw:
        raw = "postgresql://day2:day2@localhost:5432/day2"

    if raw.startswith("postgresql+asyncpg://"):
        raw = "postgresql://" + raw.removeprefix("postgresql+asyncpg://")
    elif raw.startswith("postgres+asyncpg://"):
        raw = "postgresql://" + raw.removeprefix("postgres+asyncpg://")

    parsed = urlparse(raw)
    host = parsed.hostname or "localhost"
    if host == "postgres":
        host = "localhost"
        port = parsed.port or 5432
        netloc = parsed.netloc
        if parsed.username is not None:
            userinfo = parsed.username
            if parsed.password is not None:
                userinfo = f"{userinfo}:{parsed.password}"
            netloc = f"{userinfo}@{host}:{port}"
        else:
            netloc = f"{host}:{port}"
        raw = urlunparse(parsed._replace(netloc=netloc))
    return raw


TEST_SERIES_PREFIX = "TEST_"
TEST_EMAIL_LIKE = "test+%@example.com"
# Manual smoke / leftover accounts that do not use the test+ prefix.
TEST_EMAIL_SMOKE_LIKE = "test\\_%@example.com"
# Explicit stub series names seen in manual/admin smoke (matched case-insensitively).
STUB_SERIES_NAMES = (
    "x",
    "Smoke Admin Series",
)
