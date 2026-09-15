import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import NotificationType
from app.models.notifications import NotificationQueue
from app.services import telegram as telegram_service
from app.services.push_notify import enqueue_push

pytestmark = pytest.mark.integration


def _update(text: str, chat_id: int = 555001) -> dict[str, Any]:
    return {
        "update_id": 1,
        "message": {
            "message_id": 1,
            "text": text,
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": chat_id, "username": "fox_player"},
        },
    }


async def test_telegram_link_duplicates_notifications_and_stops(
    user_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "123:test-token")
    monkeypatch.setattr(settings, "telegram_bot_username", "ginger_test_bot")
    sent: list[dict[str, Any]] = []

    async def fake_bot_api(
        method: str, payload: dict[str, Any], settings: object = None
    ) -> dict[str, Any]:
        sent.append({"method": method, **payload})
        return {"ok": True}

    monkeypatch.setattr(telegram_service, "bot_api", fake_bot_api)
    secret = {"X-Telegram-Bot-Api-Secret-Token": telegram_service.webhook_secret(settings)}

    status = (await user_client.get("/api/v1/me/telegram")).json()
    assert status == {
        "available": True,
        "linked": False,
        "username": None,
        "bot_username": "ginger_test_bot",
    }

    start = await user_client.post("/api/v1/me/telegram/link")
    assert start.status_code == 200, start.text
    url = start.json()["url"]
    assert url.startswith("https://t.me/ginger_test_bot?start=")
    token = url.split("start=", 1)[1]

    forbidden = await user_client.post(
        "/api/v1/telegram/webhook",
        json=_update(f"/start {token}"),
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
    )
    assert forbidden.status_code == 403

    linked = await user_client.post(
        "/api/v1/telegram/webhook", json=_update(f"/start {token}"), headers=secret
    )
    assert linked.status_code == 200, linked.text
    assert sent[-1]["chat_id"] == 555001
    assert sent[-1]["text"].startswith("Готово")
    status = (await user_client.get("/api/v1/me/telegram")).json()
    assert status["linked"] is True
    assert status["username"] == "fox_player"

    # Ссылка одноразовая.
    await user_client.post(
        "/api/v1/telegram/webhook", json=_update(f"/start {token}"), headers=secret
    )
    assert "устарела" in sent[-1]["text"]

    # Подключил Telegram — важное уходит в оба канала.
    me = (await user_client.get("/api/v1/auth/me")).json()
    user_id = uuid.UUID(me["id"])
    queued = await enqueue_push(
        db_session,
        user_id=user_id,
        type=NotificationType.CHIPS_ISSUED,
        title="Фишки начислены",
        body="Ginger 100",
        url="/chips",
        skip_if_in_app=False,
    )
    assert queued is True
    rows = await db_session.scalars(
        select(NotificationQueue).where(NotificationQueue.user_id == user_id)
    )
    assert sorted(row.channel.value for row in rows) == ["push", "telegram"]

    await user_client.post("/api/v1/telegram/webhook", json=_update("/stop"), headers=secret)
    assert sent[-1]["text"].startswith("Уведомления Ginger отключены")
    assert (await user_client.get("/api/v1/me/telegram")).json()["linked"] is False


async def test_telegram_unavailable_without_bot(user_client: AsyncClient) -> None:
    status = (await user_client.get("/api/v1/me/telegram")).json()
    assert status["available"] is False
    start = await user_client.post("/api/v1/me/telegram/link")
    assert start.status_code == 503
