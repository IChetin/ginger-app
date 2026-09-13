"""Parametrized RBAC checks for every /api/v1/admin/* route."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
FAKE_ID = UUID("00000000-0000-4000-8000-000000000099")

# Admin routes: (method, path template, optional json body).
# Path params use FAKE_ID — require_editor/require_admin fire before resource lookup.
ADMIN_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", f"{ADMIN}/organizers", None),
    ("POST", f"{ADMIN}/organizers", {"name": "x", "slug": "x"}),
    ("GET", f"{ADMIN}/organizers/{FAKE_ID}", None),
    ("PATCH", f"{ADMIN}/organizers/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/organizers/{FAKE_ID}", None),
    ("GET", f"{ADMIN}/clubs", None),
    ("GET", f"{ADMIN}/chip-requests", None),
    ("GET", f"{ADMIN}/players", None),
    ("GET", f"{ADMIN}/invites", None),
    ("GET", f"{ADMIN}/threads", None),
    ("GET", f"{ADMIN}/users", None),
    ("PATCH", f"{ADMIN}/users/{FAKE_ID}/role", {"role": "editor"}),
]

# Admin-only: editor must get 403.
ADMIN_ONLY_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", f"{ADMIN}/users", None),
    ("PATCH", f"{ADMIN}/users/{FAKE_ID}/role", {"role": "editor"}),
    ("POST", f"{ADMIN}/organizers", {"name": "x", "slug": "x"}),
    ("PATCH", f"{ADMIN}/organizers/{FAKE_ID}", {"name": "x"}),
    ("DELETE", f"{ADMIN}/organizers/{FAKE_ID}", None),
]

# Content routes editor may reach (2xx or 4xx other than 403).
EDITOR_ALLOWED_SMOKE: list[tuple[str, str]] = [
    ("GET", f"{ADMIN}/organizers"),
    ("GET", f"{ADMIN}/clubs"),
    ("GET", f"{ADMIN}/chip-requests"),
    ("GET", f"{ADMIN}/threads"),
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
