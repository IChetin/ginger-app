from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.auth import User
from app.models.enums import NotificationStatus, NotificationType
from app.models.notifications import NotificationQueue
from app.seeds import seed_reference_data
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _prepare(session: AsyncSession) -> None:
    await seed_reference_data(session)
    await seed_dev_users(session)

async def _seed_sent(
    session: AsyncSession,
    *,
    user_id,
    title: str,
    ntype: NotificationType = NotificationType.REMINDER,
    read_at: datetime | None = None,
    payload_extra: dict | None = None,
    sent_at: datetime | None = None,
) -> NotificationQueue:
    now = datetime.now(UTC)
    payload = {"title": title, "body": f"body-{title}", "url": "/events/1", "type": ntype.value}
    if payload_extra:
        payload.update(payload_extra)
    row = NotificationQueue(
        user_id=user_id,
        bookmark_id=None,
        type=ntype,
        payload=payload,
        scheduled_at=now - timedelta(hours=2),
        status=NotificationStatus.SENT,
        attempts=1,
        sent_at=sent_at or (now - timedelta(hours=1)),
        read_at=read_at,
    )
    session.add(row)
    await session.flush()
    return row


async def test_notifications_inbox_mark_read_and_unread_count(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()
    await login_as(client, settings.seed_editor_email)
    editor = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert editor is not None

    unread_reminder = await _seed_sent(
        db_session,
        user_id=editor.id,
        title="Reminder A",
        ntype=NotificationType.REMINDER,
    )
    unread_change = await _seed_sent(
        db_session,
        user_id=editor.id,
        title="Guarantee",
        ntype=NotificationType.GUARANTEE_CHANGED,
        payload_extra={"old_guarantee": "300000", "new_guarantee": "500000"},
        sent_at=datetime.now(UTC) - timedelta(minutes=30),
    )
    await _seed_sent(
        db_session,
        user_id=editor.id,
        title="Already read",
        ntype=NotificationType.SCHEDULE_PUBLISHED,
        read_at=datetime.now(UTC) - timedelta(days=1),
        sent_at=datetime.now(UTC) - timedelta(days=1),
    )

    count = await client.get("/api/v1/notifications/unread-count")
    assert count.status_code == 200
    assert count.json()["count"] == 2

    listing = await client.get("/api/v1/notifications", params={"limit": 20})
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    guarantee = next(item for item in body["items"] if item["id"] == str(unread_change.id))
    assert guarantee["diff"] == {"old": "300 000 ₽", "new": "500 000 ₽"}
    assert guarantee["is_unread"] is True

    reminders = await client.get("/api/v1/notifications", params={"type": "reminders"})
    assert reminders.status_code == 200
    assert reminders.json()["total"] == 1
    assert reminders.json()["items"][0]["id"] == str(unread_reminder.id)

    changes = await client.get("/api/v1/notifications", params={"type": "changes"})
    assert changes.status_code == 200
    assert changes.json()["total"] == 2

    unread_only = await client.get("/api/v1/notifications", params={"unread_only": True})
    assert unread_only.status_code == 200
    assert unread_only.json()["total"] == 2

    marked = await client.post(
        "/api/v1/notifications/read",
        json={"ids": [str(unread_reminder.id)]},
    )
    assert marked.status_code == 200
    assert marked.json()["marked"] == 1

    count2 = await client.get("/api/v1/notifications/unread-count")
    assert count2.json()["count"] == 1

    marked_all = await client.post("/api/v1/notifications/read", json={"all": True})
    assert marked_all.status_code == 200
    assert marked_all.json()["marked"] == 1

    count3 = await client.get("/api/v1/notifications/unread-count")
    assert count3.json()["count"] == 0


async def test_notifications_inbox_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/notifications")
    assert response.status_code == 401
