from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.auth import PushSubscription
from app.seeds import seed_reference_data
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def test_push_subscribe_flow(client: AsyncClient, db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    settings = get_settings()
    await login_as(client, settings.seed_admin_email)

    with patch(
        "app.services.push.get_settings",
        return_value=Settings(
            app_env="development",
            vapid_public_key="BTESTPUBLICKEY",
            otp_hmac_secret=settings.otp_hmac_secret,
            cors_origins="http://test",
        ),
    ):
        key = await client.get("/api/v1/push/vapid-public-key")
        assert key.status_code == 200
        assert key.json()["public_key"] == "BTESTPUBLICKEY"

        created = await client.post(
            "/api/v1/push/subscribe",
            json={
                "endpoint": "https://push.example/sub/1",
                "p256dh": "p256dh-key",
                "auth": "auth-key",
                "device_label": "chrome",
            },
        )
        assert created.status_code == 201, created.text

        again = await client.post(
            "/api/v1/push/subscribe",
            json={
                "endpoint": "https://push.example/sub/1",
                "p256dh": "p256dh-key-2",
                "auth": "auth-key-2",
            },
        )
        assert again.status_code == 201
        rows = list(await db_session.scalars(select(PushSubscription)))
        assert len(rows) == 1
        assert rows[0].p256dh == "p256dh-key-2"

        deleted = await client.request(
            "DELETE",
            "/api/v1/push/subscribe",
            json={"endpoint": "https://push.example/sub/1"},
        )
        assert deleted.status_code == 204

        already_gone = await client.request(
            "DELETE",
            "/api/v1/push/subscribe",
            json={"endpoint": "https://push.example/sub/1"},
        )
        assert already_gone.status_code == 204


async def test_push_unavailable_without_key(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    settings = get_settings()
    await login_as(client, settings.seed_admin_email)
    response = await client.get("/api/v1/push/vapid-public-key")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "push_unavailable"
