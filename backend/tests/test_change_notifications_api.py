from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import ChangeType, NotificationStatus, NotificationType
from app.models.notifications import NotificationQueue
from app.models.schedule import ChangeLog, Flight
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import seed_demo_schedule
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as, seed_organizer_id, seed_venue_id

pytestmark = pytest.mark.integration

ADMIN_PREFIX = "/api/v1/admin"


async def _prepare(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_demo_schedule(db_session)


async def _create_published_series_with_flight(
    client: AsyncClient,
    *,
    name: str = "Notify Series",
) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    series_resp = await client.post(
        f"{ADMIN_PREFIX}/series",
        json={
            "organizer_id": str(seed_organizer_id()),
            "venue_id": str(seed_venue_id()),
            "name": name,
            "starts_on": date(2026, 9, 1).isoformat(),
            "ends_on": date(2026, 9, 7).isoformat(),
        },
    )
    assert series_resp.status_code == 201, series_resp.text
    series = series_resp.json()

    event_resp = await client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/events",
        json={
            "number": 1,
            "name": "Main Event",
            "buyin": "10000.00",
            "currency_code": "RUB",
            "guarantee": "1000000.00",
            "start_stack": 30000,
            "reentry_count": 1,
            "late_reg_level": 6,
        },
    )
    assert event_resp.status_code == 201, event_resp.text
    event = event_resp.json()

    flights_resp = await client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-09-02T15:00:00"}],
    )
    assert flights_resp.status_code == 200, flights_resp.text
    flight = flights_resp.json()[0]

    preview = await client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json={"status": "schedule_published"},
    )
    assert preview.status_code == 200, preview.text
    publish = await client.patch(
        f"{ADMIN_PREFIX}/series/{series['id']}",
        json={"status": "schedule_published"},
        headers={"X-Preview-Token": preview.json()["preview_token"]},
    )
    assert publish.status_code == 200, publish.text
    return series, event, flight


async def test_preview_series_does_not_mutate(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series, _event, _flight = await _create_published_series_with_flight(
        editor_client,
        name="Preview No Mutate",
    )
    series_id = UUID(series["id"])

    before = await db_session.scalar(select(ChangeLog).where(ChangeLog.entity_id == series_id))
    # publish already wrote one change_log
    assert before is not None
    before_count = await db_session.scalar(
        select(func.count()).select_from(ChangeLog).where(ChangeLog.entity_id == series_id)
    )

    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json={"starts_on": "2026-09-02", "ends_on": "2026-09-08"},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["requires_confirmation"] is True
    assert body["entity_type"] == "series"
    assert body["preview_token"]

    after_count = await db_session.scalar(
        select(func.count()).select_from(ChangeLog).where(ChangeLog.entity_id == series_id)
    )
    assert after_count == before_count

    series_get = await editor_client.get(f"{ADMIN_PREFIX}/series/{series['id']}")
    assert series_get.json()["starts_on"] == "2026-09-01"


async def test_confirm_with_token_enqueues_and_sets_notified_at(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()
    series, _event, _flight = await _create_published_series_with_flight(
        editor_client,
        name="Confirm Fanout",
    )

    await login_as(client, settings.seed_admin_email)
    bookmark = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "series", "target_id": series["id"]},
    )
    assert bookmark.status_code == 201, bookmark.text

    body = {"starts_on": "2026-09-03", "ends_on": "2026-09-09"}
    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json=body,
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["total_recipients"] >= 1

    confirm = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series['id']}",
        json=body,
        headers={"X-Preview-Token": preview.json()["preview_token"]},
    )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["starts_on"] == "2026-09-03"

    entry = await db_session.scalar(
        select(ChangeLog)
        .where(
            ChangeLog.entity_id == UUID(series["id"]),
            ChangeLog.change_type == ChangeType.UPDATED,
        )
        .order_by(ChangeLog.created_at.desc())
    )
    assert entry is not None
    assert entry.notified_at is not None
    assert entry.new_value is not None
    assert entry.new_value.get("starts_on") == "2026-09-03"

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.change_log_id == entry.id,
            NotificationQueue.type == NotificationType.TIME_CHANGED,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert queued == 1


async def test_confirm_with_notify_false_skips_queue(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()
    series, _event, _flight = await _create_published_series_with_flight(
        editor_client,
        name="Silent Confirm",
    )

    await login_as(client, settings.seed_admin_email)
    bookmark = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "series", "target_id": series["id"]},
    )
    assert bookmark.status_code == 201, bookmark.text

    body = {"starts_on": "2026-09-04", "ends_on": "2026-09-10"}
    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json=body,
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["total_recipients"] >= 1

    confirm = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series['id']}",
        json=body,
        headers={
            "X-Preview-Token": preview.json()["preview_token"],
            "X-Notify": "0",
        },
    )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["starts_on"] == "2026-09-04"

    entry = await db_session.scalar(
        select(ChangeLog)
        .where(
            ChangeLog.entity_id == UUID(series["id"]),
            ChangeLog.change_type == ChangeType.UPDATED,
        )
        .order_by(ChangeLog.created_at.desc())
    )
    assert entry is not None
    assert entry.notified_at is None
    assert entry.new_value is not None
    assert entry.new_value.get("starts_on") == "2026-09-04"

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(NotificationQueue.change_log_id == entry.id)
    )
    assert queued == 0


async def test_stale_preview_token_returns_409(
    editor_client: AsyncClient,
) -> None:
    series, _event, _flight = await _create_published_series_with_flight(
        editor_client,
        name="Stale Token Series",
    )
    body_a = {"name": "Name A"}
    preview_a = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json=body_a,
    )
    assert preview_a.status_code == 200
    token_a = preview_a.json()["preview_token"]

    body_b = {"name": "Name B"}
    preview_b = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json=body_b,
    )
    assert preview_b.status_code == 200
    applied = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series['id']}",
        json=body_b,
        headers={"X-Preview-Token": preview_b.json()["preview_token"]},
    )
    assert applied.status_code == 200

    stale = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series['id']}",
        json=body_a,
        headers={"X-Preview-Token": token_a},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "preview_stale"


async def test_flight_move_reschedules_reminders(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()
    series, event, flight = await _create_published_series_with_flight(
        editor_client,
        name="Flight Move Series",
    )

    await login_as(client, settings.seed_admin_email)
    created = await client.post(
        "/api/v1/bookmarks",
        json={
            "target_type": "flight",
            "target_id": flight["id"],
            "reminder_offsets": [1440],
        },
    )
    assert created.status_code == 201, created.text
    bookmark_id = created.json()["id"]

    before = await db_session.scalar(
        select(NotificationQueue).where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert before is not None
    before_scheduled = before.scheduled_at
    before_id = before.id

    flights_body = [
        {
            "id": flight["id"],
            "start_at": "2026-09-03T18:00:00",
        }
    ]
    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights/preview",
        json=flights_body,
    )
    assert preview.status_code == 200, preview.text
    confirm = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=flights_body,
        headers={"X-Preview-Token": preview.json()["preview_token"]},
    )
    assert confirm.status_code == 200, confirm.text

    after = await db_session.scalar(
        select(NotificationQueue).where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert after is not None
    assert after.id != before_id
    assert after.scheduled_at != before_scheduled

    pending_count = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.bookmark_id == bookmark_id,
            NotificationQueue.type == NotificationType.REMINDER,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert pending_count == 1
    stale = await db_session.get(NotificationQueue, before_id)
    assert stale is None


async def test_flight_time_change_notifies_only_that_flight_subscribers(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()
    series, event, flight_a = await _create_published_series_with_flight(
        editor_client,
        name="Flight Fanout Isolation",
    )

    flights_body = [
        {"id": flight_a["id"], "label": "A", "start_at": "2026-09-02T15:00:00"},
        {"start_at": "2026-09-03T15:00:00", "label": "B"},
    ]
    preview_add = await editor_client.post(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights/preview",
        json=flights_body,
    )
    assert preview_add.status_code == 200, preview_add.text
    put = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=flights_body,
        headers={"X-Preview-Token": preview_add.json()["preview_token"]},
    )
    assert put.status_code == 200, put.text
    flight_a = next(f for f in put.json() if f.get("label") == "A")
    flight_b = next(f for f in put.json() if f.get("label") == "B")

    from app.models.auth import User
    from app.models.enums import BookmarkTarget
    from tests.factories import BookmarkFactory, persist

    admin = await db_session.scalar(select(User).where(User.email == settings.seed_admin_email))
    editor = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert admin is not None and editor is not None

    await persist(
        db_session,
        BookmarkFactory(
            user=admin,
            user_id=admin.id,
            target_type=BookmarkTarget.FLIGHT,
            target_id=UUID(flight_a["id"]),
            reminder_offsets=[120],
        ),
    )
    await persist(
        db_session,
        BookmarkFactory(
            user=editor,
            user_id=editor.id,
            target_type=BookmarkTarget.FLIGHT,
            target_id=UUID(flight_b["id"]),
            reminder_offsets=[120],
        ),
    )
    await persist(
        db_session,
        BookmarkFactory(
            user=editor,
            user_id=editor.id,
            target_type=BookmarkTarget.SERIES,
            target_id=UUID(series["id"]),
            reminder_offsets=[],
        ),
    )

    move = [
        {"id": flight_a["id"], "label": "A", "start_at": "2026-09-02T18:00:00"},
        {"id": flight_b["id"], "label": "B", "start_at": "2026-09-03T15:00:00"},
    ]
    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights/preview",
        json=move,
    )
    assert preview.status_code == 200, preview.text
    confirm = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=move,
        headers={"X-Preview-Token": preview.json()["preview_token"]},
    )
    assert confirm.status_code == 200, confirm.text

    time_changed = list(
        await db_session.scalars(
            select(NotificationQueue).where(
                NotificationQueue.type == NotificationType.TIME_CHANGED,
            )
        )
    )
    assert len(time_changed) == 1
    assert time_changed[0].user_id == admin.id
    assert time_changed[0].user_id != editor.id
    assert time_changed[0].change_log_id is not None

    flight_logs = list(
        await db_session.scalars(
            select(ChangeLog).where(ChangeLog.entity_id == UUID(flight_a["id"]))
        )
    )
    assert any(log.id == time_changed[0].change_log_id for log in flight_logs)


async def test_event_cancel_enqueues_event_cancelled(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()
    _series, event, flight = await _create_published_series_with_flight(
        editor_client,
        name="Cancel Event Series",
    )

    await login_as(client, settings.seed_admin_email)
    bookmark = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "flight", "target_id": flight["id"], "reminder_offsets": [120]},
    )
    assert bookmark.status_code == 201, bookmark.text

    body = {"status": "cancelled"}
    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/events/{event['id']}/preview",
        json=body,
    )
    assert preview.status_code == 200, preview.text
    confirm = await editor_client.patch(
        f"{ADMIN_PREFIX}/events/{event['id']}",
        json=body,
        headers={"X-Preview-Token": preview.json()["preview_token"]},
    )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["status"] == "cancelled"

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.type == NotificationType.EVENT_CANCELLED,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert queued == 1


async def test_schedule_publish_notifies_series_subscribers(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()

    series_resp = await editor_client.post(
        f"{ADMIN_PREFIX}/series",
        json={
            "organizer_id": str(seed_organizer_id()),
            "venue_id": str(seed_venue_id()),
            "name": "Publish Notify Series",
            "starts_on": date(2026, 11, 1).isoformat(),
            "ends_on": date(2026, 11, 5).isoformat(),
        },
    )
    assert series_resp.status_code == 201, series_resp.text
    series = series_resp.json()

    event_resp = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/events",
        json={
            "number": 1,
            "name": "Main",
            "buyin": "5000.00",
            "currency_code": "RUB",
        },
    )
    assert event_resp.status_code == 201, event_resp.text
    event = event_resp.json()
    flights = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-11-02T15:00:00"}],
    )
    assert flights.status_code == 200, flights.text

    await login_as(client, settings.seed_admin_email)
    bookmark = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "series", "target_id": series["id"]},
    )
    assert bookmark.status_code == 201, bookmark.text

    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series['id']}/preview",
        json={"status": "schedule_published"},
    )
    assert preview.status_code == 200, preview.text
    publish = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series['id']}",
        json={"status": "schedule_published"},
        headers={"X-Preview-Token": preview.json()["preview_token"]},
    )
    assert publish.status_code == 200, publish.text

    entry = await db_session.scalar(
        select(ChangeLog)
        .where(
            ChangeLog.entity_id == UUID(series["id"]),
            ChangeLog.change_type == ChangeType.SCHEDULE_PUBLISHED,
        )
        .order_by(ChangeLog.created_at.desc())
    )
    assert entry is not None
    assert entry.notified_at is not None

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(
            NotificationQueue.change_log_id == entry.id,
            NotificationQueue.type == NotificationType.SCHEDULE_PUBLISHED,
            NotificationQueue.status == NotificationStatus.PENDING,
        )
    )
    assert queued == 1


async def test_notification_history_ownership(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    settings = get_settings()

    await login_as(client, settings.seed_editor_email)
    from app.models.auth import User

    editor = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    admin = await db_session.scalar(select(User).where(User.email == settings.seed_admin_email))
    assert editor is not None
    assert admin is not None

    now = datetime.now(UTC)
    own = NotificationQueue(
        user_id=editor.id,
        bookmark_id=None,
        type=NotificationType.TIME_CHANGED,
        payload={"title": "Own", "body": "mine", "url": "/series/1"},
        scheduled_at=now,
        status=NotificationStatus.SENT,
        attempts=1,
        sent_at=now - timedelta(days=1),
    )
    other = NotificationQueue(
        user_id=admin.id,
        bookmark_id=None,
        type=NotificationType.TIME_CHANGED,
        payload={"title": "Other", "body": "theirs", "url": "/series/2"},
        scheduled_at=now,
        status=NotificationStatus.SENT,
        attempts=1,
        sent_at=now - timedelta(days=1),
    )
    db_session.add_all([own, other])
    await db_session.flush()

    history = await client.get("/api/v1/notifications/history?days=30")
    assert history.status_code == 200
    items = history.json()
    assert len(items) == 1
    assert items[0]["title"] == "Own"
    assert items[0]["id"] == str(own.id)


async def test_bookmarks_overview_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/bookmarks/overview")
    assert response.status_code == 401


async def test_bookmarks_overview_returns_enriched_items(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
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
            "reminder_offsets": [120],
        },
    )
    assert created.status_code == 201

    overview = await client.get("/api/v1/bookmarks/overview")
    assert overview.status_code == 200
    items = overview.json()
    assert len(items) >= 1
    item = next(row for row in items if row["id"] == created.json()["id"])
    assert item["title"]
    assert item["event_id"] == str(flight.event_id)
    assert item["url"].startswith("/events/")
    assert item["nearest_start_at"] is not None


async def test_publish_requires_preview_token(editor_client: AsyncClient) -> None:
    series_resp = await editor_client.post(
        f"{ADMIN_PREFIX}/series",
        json={
            "organizer_id": str(seed_organizer_id()),
            "venue_id": str(seed_venue_id()),
            "name": "Token Required",
            "starts_on": "2026-10-01",
            "ends_on": "2026-10-05",
        },
    )
    series_id = series_resp.json()["id"]
    denied = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series_id}",
        json={"status": "schedule_published"},
    )
    assert denied.status_code == 400
    assert denied.json()["error"]["code"] == "preview_required"
