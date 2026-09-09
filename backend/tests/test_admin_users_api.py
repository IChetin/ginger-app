from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import normalize_email
from app.models.enums import UserRole
from app.seeds.dev_users import seed_dev_users
from app.seeds.runner import seed_reference_data
from tests.conftest import login_as
from tests.factories import UserFactory, persist

pytestmark = pytest.mark.integration

ADMIN_PREFIX = "/api/v1/admin"


async def test_editor_cannot_list_or_change_roles(editor_client: AsyncClient) -> None:
    listed = await editor_client.get(f"{ADMIN_PREFIX}/users")
    assert listed.status_code == 403

    patch = await editor_client.patch(
        f"{ADMIN_PREFIX}/users/00000000-0000-4000-8000-000000000099/role",
        json={"role": "editor"},
    )
    assert patch.status_code == 403


async def test_admin_lists_users_and_searches(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await persist(
        db_session,
        UserFactory(
            email="searchable@example.com",
            nickname="search_nick",
            email_verified_at=datetime.now(UTC),
            role=UserRole.USER,
        ),
    )

    listed = await admin_client.get(f"{ADMIN_PREFIX}/users")
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] >= 3
    assert len(body["items"]) >= 3

    searched = await admin_client.get(
        f"{ADMIN_PREFIX}/users",
        params={"search": "searchable"},
    )
    assert searched.status_code == 200
    items = searched.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "searchable@example.com"
    assert items[0]["nickname"] == "search_nick"
    assert items[0]["role"] == "user"
    assert items[0]["is_superadmin"] is False

    by_role = await admin_client.get(
        f"{ADMIN_PREFIX}/users",
        params={"role": "editor"},
    )
    assert by_role.status_code == 200
    assert all(item["role"] == "editor" for item in by_role.json()["items"])


async def test_admin_updates_user_role(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await persist(
        db_session,
        UserFactory(
            email="promote@example.com",
            nickname="to_promote",
            email_verified_at=datetime.now(UTC),
            role=UserRole.USER,
        ),
    )

    response = await admin_client.patch(
        f"{ADMIN_PREFIX}/users/{user.id}/role",
        json={"role": "editor"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "editor"

    await db_session.refresh(user)
    assert user.role == UserRole.EDITOR


async def test_cannot_change_own_role(admin_client: AsyncClient) -> None:
    me = await admin_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    admin_id = me.json()["id"]

    response = await admin_client.patch(
        f"{ADMIN_PREFIX}/users/{admin_id}/role",
        json={"role": "user"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "cannot_change_own_role"


async def test_cannot_change_superadmin_role(
    admin_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    target = await persist(
        db_session,
        UserFactory(
            email="env-super@example.com",
            nickname="env_super",
            email_verified_at=datetime.now(UTC),
            role=UserRole.ADMIN,
        ),
    )
    monkeypatch.setattr(settings, "superadmin_emails", "env-super@example.com")

    response = await admin_client.patch(
        f"{ADMIN_PREFIX}/users/{target.id}/role",
        json={"role": "user"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "superadmin_protected"

    await db_session.refresh(target)
    assert target.role == UserRole.ADMIN


async def test_superadmin_login_promotes_role(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Env superadmin is promoted on session create even for a non-seed email."""
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)

    settings = get_settings()
    email = "prod-super@example.com"
    monkeypatch.setattr(settings, "superadmin_emails", email)

    user = await persist(
        db_session,
        UserFactory(
            email=normalize_email(email),
            nickname="prod_super",
            email_verified_at=datetime.now(UTC),
            role=UserRole.USER,
        ),
    )
    assert user.role == UserRole.USER

    await login_as(client, email, settings=settings)

    await db_session.refresh(user)
    assert user.role == UserRole.ADMIN

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


async def test_list_users_marks_superadmin_flag(
    admin_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "superadmin_emails", settings.seed_admin_email)

    response = await admin_client.get(f"{ADMIN_PREFIX}/users", params={"role": "admin"})
    assert response.status_code == 200
    admins = response.json()["items"]
    seed_admin = next(
        item for item in admins if item["email"] == normalize_email(settings.seed_admin_email)
    )
    assert seed_admin["is_superadmin"] is True
