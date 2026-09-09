from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ChangeType, NotificationStatus, NotificationType
from app.models.notifications import NotificationQueue
from app.models.schedule import ChangeLog
from tests.conftest import seed_organizer_id, seed_venue_id
from tests.factories import SeriesFactory, UserFactory, persist

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"


async def test_change_log_list_delivery_and_via_import(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from app.models.references import Organizer, Venue

    actor = await persist(db_session, UserFactory(email=f"clog-{uuid4().hex[:8]}@example.com"))
    organizer = await db_session.get(Organizer, seed_organizer_id())
    venue = await db_session.get(Venue, seed_venue_id())
    assert organizer is not None and venue is not None
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Change Log Series",
        ),
    )
    entry = ChangeLog(
        entity_type="series",
        entity_id=series.id,
        change_type=ChangeType.SCHEDULE_PUBLISHED,
        old_value={"status": "announced"},
        new_value={
            "status": "schedule_published",
            "via": "import",
            "import_job_id": str(uuid4()),
            "events_created": 3,
        },
        actor_id=actor.id,
        notified_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(entry)
    await db_session.flush()

    for status in (
        NotificationStatus.SENT,
        NotificationStatus.SENT,
        NotificationStatus.FAILED,
        NotificationStatus.PENDING,
    ):
        user = await persist(
            db_session,
            UserFactory(email=f"nq-{uuid4().hex[:8]}@example.com"),
        )
        db_session.add(
            NotificationQueue(
                user_id=user.id,
                change_log_id=entry.id,
                type=NotificationType.SCHEDULE_PUBLISHED,
                payload={"title": "t"},
                scheduled_at=datetime.now(UTC),
                status=status,
            )
        )
    await db_session.flush()

    response = await editor_client.get(
        f"{ADMIN}/change-log",
        params={"period": "all", "q": "Change Log Series", "limit": 50},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items
    hit = next(item for item in items if item["id"] == str(entry.id))
    assert hit["via_import"] is True
    assert hit["series_name"] == "Change Log Series"
    assert hit["notifications_sent"] == 2
    assert hit["notifications_failed"] == 1
    assert hit["notifications_pending"] == 1

    filtered = await editor_client.get(
        f"{ADMIN}/change-log",
        params={"period": "7", "change_type": "schedule_published"},
    )
    assert filtered.status_code == 200
    assert any(item["id"] == str(entry.id) for item in filtered.json()["items"])

    old = ChangeLog(
        entity_type="series",
        entity_id=series.id,
        change_type=ChangeType.UPDATED,
        old_value={"name": "a"},
        new_value={"name": "b"},
        actor_id=actor.id,
        created_at=datetime.now(UTC) - timedelta(days=40),
    )
    db_session.add(old)
    await db_session.flush()
    recent_only = await editor_client.get(f"{ADMIN}/change-log", params={"period": "7"})
    assert all(item["id"] != str(old.id) for item in recent_only.json()["items"])
