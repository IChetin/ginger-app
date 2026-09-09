"""Parametrized RBAC checks for every /api/v1/admin/* route."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
FAKE_ID = UUID("00000000-0000-4000-8000-000000000099")

# Every admin route: (method, path template, optional json body).
# Path params use FAKE_ID — require_editor/require_admin fire before resource lookup.
ADMIN_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", f"{ADMIN}/dashboard", None),
    ("GET", f"{ADMIN}/venues", None),
    (
        "POST",
        f"{ADMIN}/venues",
        {"name": "x", "city": "x", "country_code": "RU", "timezone": "Europe/Moscow"},
    ),
    ("GET", f"{ADMIN}/venues/{FAKE_ID}", None),
    ("PATCH", f"{ADMIN}/venues/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/venues/{FAKE_ID}", None),
    ("GET", f"{ADMIN}/organizers", None),
    ("POST", f"{ADMIN}/organizers", {"name": "x", "slug": "x"}),
    ("GET", f"{ADMIN}/organizers/{FAKE_ID}", None),
    ("PATCH", f"{ADMIN}/organizers/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/organizers/{FAKE_ID}", None),
    ("POST", f"{ADMIN}/organizers/{FAKE_ID}/logo", None),
    ("DELETE", f"{ADMIN}/organizers/{FAKE_ID}/logo", None),
    ("GET", f"{ADMIN}/parsers", None),
    ("GET", f"{ADMIN}/parsers/{FAKE_ID}", None),
    ("PATCH", f"{ADMIN}/parsers/{FAKE_ID}", {"title": "x"}),
    ("GET", f"{ADMIN}/series", None),
    (
        "POST",
        f"{ADMIN}/series",
        {
            "name": "x",
            "organizer_id": str(FAKE_ID),
            "venue_id": str(FAKE_ID),
            "starts_on": "2026-01-01",
            "ends_on": "2026-01-02",
            "status": "draft",
        },
    ),
    ("GET", f"{ADMIN}/series/{FAKE_ID}", None),
    ("GET", f"{ADMIN}/series/{FAKE_ID}/changes", None),
    ("POST", f"{ADMIN}/series/{FAKE_ID}/preview", {"status": "published"}),
    ("PATCH", f"{ADMIN}/series/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/series/{FAKE_ID}", None),
    ("GET", f"{ADMIN}/series/{FAKE_ID}/events", None),
    (
        "POST",
        f"{ADMIN}/series/{FAKE_ID}/events",
        {
            "name": "x",
            "number": 1,
            "buy_in": "1000",
            "currency_code": "RUB",
            "game_type": "nlhe",
        },
    ),
    ("GET", f"{ADMIN}/events/{FAKE_ID}", None),
    ("GET", f"{ADMIN}/events/{FAKE_ID}/changes", None),
    ("POST", f"{ADMIN}/events/{FAKE_ID}/duplicate", None),
    ("POST", f"{ADMIN}/events/{FAKE_ID}/preview", {"name": "x"}),
    ("PATCH", f"{ADMIN}/events/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/events/{FAKE_ID}", None),
    ("GET", f"{ADMIN}/events/{FAKE_ID}/flights", None),
    ("POST", f"{ADMIN}/events/{FAKE_ID}/flights/preview", {"flights": []}),
    ("PUT", f"{ADMIN}/events/{FAKE_ID}/flights", {"flights": []}),
    ("GET", f"{ADMIN}/events/{FAKE_ID}/blind-levels", None),
    ("PUT", f"{ADMIN}/events/{FAKE_ID}/blind-levels", {"levels": []}),
    ("GET", f"{ADMIN}/import/stats", None),
    ("GET", f"{ADMIN}/import", None),
    ("GET", f"{ADMIN}/import/{FAKE_ID}", None),
    ("PUT", f"{ADMIN}/import/{FAKE_ID}/draft", {"events": []}),
    ("POST", f"{ADMIN}/import/{FAKE_ID}/publish/preview", None),
    ("POST", f"{ADMIN}/import/{FAKE_ID}/publish", None),
    ("GET", f"{ADMIN}/import/bulk", None),
    ("GET", f"{ADMIN}/import/bulk/{FAKE_ID}", None),
    ("POST", f"{ADMIN}/import/bulk/{FAKE_ID}/preview", None),
    ("POST", f"{ADMIN}/import/bulk/{FAKE_ID}/publish", None),
    ("GET", f"{ADMIN}/users", None),
    ("PATCH", f"{ADMIN}/users/{FAKE_ID}/role", {"role": "editor"}),
    ("GET", f"{ADMIN}/change-log", None),
]

# Admin-only: editor must get 403.
ADMIN_ONLY_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", f"{ADMIN}/users", None),
    ("PATCH", f"{ADMIN}/users/{FAKE_ID}/role", {"role": "editor"}),
    (
        "POST",
        f"{ADMIN}/venues",
        {"name": "x", "city": "x", "country_code": "RU", "timezone": "Europe/Moscow"},
    ),
    ("PATCH", f"{ADMIN}/venues/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/venues/{FAKE_ID}", None),
    ("POST", f"{ADMIN}/organizers", {"name": "x", "slug": "x"}),
    ("PATCH", f"{ADMIN}/organizers/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/organizers/{FAKE_ID}", None),
    ("POST", f"{ADMIN}/organizers/{FAKE_ID}/logo", None),
    ("DELETE", f"{ADMIN}/organizers/{FAKE_ID}/logo", None),
    ("PATCH", f"{ADMIN}/parsers/{FAKE_ID}", {"title": "x"}),
]

# Content routes editor may reach (2xx or 4xx other than 403).
EDITOR_ALLOWED_SMOKE: list[tuple[str, str]] = [
    ("GET", f"{ADMIN}/dashboard"),
    ("GET", f"{ADMIN}/venues"),
    ("GET", f"{ADMIN}/organizers"),
    ("GET", f"{ADMIN}/parsers"),
    ("GET", f"{ADMIN}/series"),
    ("GET", f"{ADMIN}/import"),
    ("GET", f"{ADMIN}/import/stats"),
    ("GET", f"{ADMIN}/change-log"),
]


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    ADMIN_ROUTES,
    ids=[f"{m} {p}" for m, p, _ in ADMIN_ROUTES],
)
async def test_user_denied_on_all_admin_routes(
    user_client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, Any] | None,
) -> None:
    response = await user_client.request(method, path, json=payload)
    assert response.status_code == 403, f"{method} {path}: {response.status_code} {response.text}"


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    ADMIN_ONLY_ROUTES,
    ids=[f"{m} {p}" for m, p, _ in ADMIN_ONLY_ROUTES],
)
async def test_editor_denied_on_admin_only_routes(
    editor_client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, Any] | None,
) -> None:
    response = await editor_client.request(method, path, json=payload)
    assert response.status_code == 403, f"{method} {path}: {response.status_code} {response.text}"


@pytest.mark.parametrize(
    ("method", "path"),
    EDITOR_ALLOWED_SMOKE,
    ids=[f"{m} {p}" for m, p in EDITOR_ALLOWED_SMOKE],
)
async def test_editor_allowed_on_content_routes(
    editor_client: AsyncClient,
    method: str,
    path: str,
) -> None:
    response = await editor_client.request(method, path)
    assert response.status_code != 403, f"{method} {path}: unexpected 403"
    assert response.status_code < 500, f"{method} {path}: {response.status_code} {response.text}"
