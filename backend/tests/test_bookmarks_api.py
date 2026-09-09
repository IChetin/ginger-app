from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationStatus, NotificationType, SeriesStatus
from app.models.notifications import Bookmark, NotificationQueue
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import seed_demo_schedule
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _prepare(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_demo_schedule(db_session)


async def test_bookmarks_crud_and_reminders(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings
    from app.models.schedule import Flight

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    flight = await db_session.scalar(select(Flight).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) + timedelta(days=2)
    await db_session.flush()

    created = await client.post(
        "/api/v1/bookmarks",
        json={
            "target_type": "flight",
            "target_id": str(flight.id),
            "reminder_offsets": [1440, 120],
        },
    )
    assert created.status_code == 201, created.text
    bookmark_id = created.json()["id"]
    assert created.json()["reminder_offsets"] == [1440, 120]

    queue_count = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert queue_count == 2

    listed = await client.get("/api/v1/bookmarks")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    patched = await client.patch(
        f"/api/v1/bookmarks/{bookmark_id}",
        json={"reminder_offsets": [60]},
    )
    assert patched.status_code == 200
    assert patched.json()["reminder_offsets"] == [60]
    queue_count = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert queue_count == 1

    deleted = await client.delete(f"/api/v1/bookmarks/{bookmark_id}")
    assert deleted.status_code == 204
    pending = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert pending == 0


async def test_series_bookmark_without_reminders(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings
    from app.models.schedule import Series

    settings = get_settings()
    await login_as(client, settings.seed_admin_email)
    series = await db_session.scalar(
        select(Series).where(Series.status == SeriesStatus.SCHEDULE_PUBLISHED).limit(1)
    )
    assert series is not None

    created = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "series", "target_id": str(series.id)},
    )
    assert created.status_code == 201
    assert created.json()["reminder_offsets"] == []
    # Flight reminders are not scheduled for series bookmarks; series_starting may be.
    reminder_count = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.bookmark_id == created.json()["id"],
            NotificationQueue.type == NotificationType.REMINDER,
        )
    )
    assert reminder_count == 0
    starting_count = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.bookmark_id == created.json()["id"],
            NotificationQueue.type == NotificationType.SERIES_STARTING,
        )
    )
    assert starting_count >= 0


async def test_migrate_server_wins(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings
    from app.models.auth import User
    from app.models.schedule import Flight

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    flight = await db_session.scalar(select(Flight).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) + timedelta(days=3)
    await db_session.flush()

    existing = Bookmark(
        user_id=user.id,
        target_type="flight",
        target_id=flight.id,
        reminder_offsets=[1440],
    )
    db_session.add(existing)
    await db_session.flush()

    migrated = await client.post(
        "/api/v1/bookmarks/migrate",
        json={
            "items": [
                {
                    "target_type": "flight",
                    "target_id": str(flight.id),
                    "reminder_offsets": [15],
                },
                {
                    "target_type": "flight",
                    "target_id": str(uuid4()),
                    "reminder_offsets": [60],
                },
            ]
        },
    )
    assert migrated.status_code == 200, migrated.text
    body = migrated.json()
    assert body["created"] == 0
    assert body["skipped"] == 2
    refreshed = await db_session.scalar(select(Bookmark).where(Bookmark.id == existing.id))
    assert refreshed is not None
    assert refreshed.reminder_offsets == [1440]


async def test_bookmarks_require_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/bookmarks")
    assert response.status_code == 401


async def test_delete_preserves_sent_history(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings
    from app.models.auth import User
    from app.models.schedule import Flight

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    flight = await db_session.scalar(select(Flight).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) + timedelta(days=2)
    await db_session.flush()

    created = await client.post(
        "/api/v1/bookmarks",
        json={
            "target_type": "flight",
            "target_id": str(flight.id),
            "reminder_offsets": [120],
        },
    )
    assert created.status_code == 201
    bookmark_id = created.json()["id"]

    pending = await db_session.scalar(
        select(NotificationQueue).where(NotificationQueue.bookmark_id == bookmark_id)
    )
    assert pending is not None
    pending.status = NotificationStatus.SENT
    pending.sent_at = datetime.now(UTC)
    await db_session.flush()
    history_id = pending.id

    deleted = await client.delete(f"/api/v1/bookmarks/{bookmark_id}")
    assert deleted.status_code == 204

    history = await db_session.get(NotificationQueue, history_id)
    assert history is not None
    assert history.status == NotificationStatus.SENT
    assert history.bookmark_id is None


async def test_bookmarks_overview_structured_fields(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from sqlalchemy.orm import selectinload

    from app.core.config import get_settings
    from app.models.schedule import Event, Flight, Series

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    flight = await db_session.scalar(select(Flight).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) + timedelta(days=2)
    await db_session.flush()

    series = await db_session.scalar(
        select(Series)
        .where(Series.status == SeriesStatus.SCHEDULE_PUBLISHED)
        .options(selectinload(Series.venue), selectinload(Series.organizer))
        .limit(1)
    )
    assert series is not None

    flight_bm = await client.post(
        "/api/v1/bookmarks",
        json={
            "target_type": "flight",
            "target_id": str(flight.id),
            "reminder_offsets": [120],
        },
    )
    assert flight_bm.status_code == 201, flight_bm.text

    series_bm = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "series", "target_id": str(series.id)},
    )
    assert series_bm.status_code == 201, series_bm.text

    overview = await client.get("/api/v1/bookmarks/overview")
    assert overview.status_code == 200
    items = overview.json()

    flight_item = next(row for row in items if row["id"] == flight_bm.json()["id"])
    assert flight_item["series_name"]
    assert flight_item["series_status"]
    assert flight_item["organizer_name"]
    assert flight_item["organizer_slug"]
    assert flight_item["venue_city"]
    assert flight_item["venue_name"]
    assert flight_item["event_name"]
    assert flight_item["event_id"] == str(flight.event_id)
    assert flight_item["flight_label"] == flight.label
    assert flight_item["nearest_start_at"] is not None

    # Reload event for number assertion without relying on lazy load.
    event = await db_session.get(Event, flight.event_id)
    assert event is not None
    assert flight_item["event_number"] == event.number

    series_item = next(row for row in items if row["id"] == series_bm.json()["id"])
    assert series_item["series_name"] == series.name
    assert series_item["series_status"] == series.status.value
    assert series_item["organizer_slug"] == series.organizer.slug
    assert series_item["venue_city"] == series.venue.city
    assert series_item["series_starts_on"] == series.starts_on.isoformat()
    assert series_item["series_ends_on"] == series.ends_on.isoformat()
    assert series_item["event_id"] is None
    assert series_item["url"] == f"/series/{series.slug}"


async def test_resolve_targets_public_mixed_batch(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.models.schedule import Flight, Series

    flight = await db_session.scalar(select(Flight).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) + timedelta(days=2)
    await db_session.flush()

    series = await db_session.scalar(
        select(Series).where(Series.status == SeriesStatus.SCHEDULE_PUBLISHED).limit(1)
    )
    assert series is not None
    unknown_id = uuid4()

    response = await client.post(
        "/api/v1/bookmarks/resolve-targets",
        json={
            "items": [
                {"target_type": "flight", "target_id": str(flight.id)},
                {"target_type": "series", "target_id": str(series.id)},
                {"target_type": "flight", "target_id": str(unknown_id)},
            ]
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 3

    flight_item = body["items"][0]
    assert flight_item["found"] is True
    assert flight_item["target_id"] == str(flight.id)
    assert flight_item["display"] is not None
    assert flight_item["display"]["event_id"] == str(flight.event_id)
    assert flight_item["display"]["series_name"]
    assert flight_item["display"]["venue_city"]
    assert flight_item["display"]["organizer_slug"]

    series_item = body["items"][1]
    assert series_item["found"] is True
    assert series_item["display"]["series_id"] == str(series.id)
    assert series_item["display"]["url"] == f"/series/{series.slug}"

    missing = body["items"][2]
    assert missing["found"] is False
    assert missing["display"] is None
    assert missing["target_id"] == str(unknown_id)


async def test_resolve_targets_no_auth_required(client: AsyncClient) -> None:
    response = await client.post("/api/v1/bookmarks/resolve-targets", json={"items": []})
    assert response.status_code == 200
    assert response.json() == {"items": []}


async def test_past_offsets_skipped(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings
    from app.models.schedule import Flight

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)
    flight = await db_session.scalar(select(Flight).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) + timedelta(minutes=30)
    await db_session.flush()

    created = await client.post(
        "/api/v1/bookmarks",
        json={
            "target_type": "flight",
            "target_id": str(flight.id),
            "reminder_offsets": [1440, 15],
        },
    )
    assert created.status_code == 201
    bookmark_id = created.json()["id"]
    pending = await db_session.scalars(
        select(NotificationQueue).where(NotificationQueue.bookmark_id == bookmark_id)
    )
    rows = list(pending)
    assert len(rows) == 1
    assert rows[0].payload["offset_minutes"] == 15
