from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    BookmarkTarget,
    ChangeType,
    ImportStatus,
    NotificationStatus,
    NotificationType,
    SeriesStatus,
)
from app.models.notifications import Bookmark, NotificationQueue
from app.models.schedule import ChangeLog
from tests.conftest import seed_organizer_id, seed_venue_id
from tests.factories import (
    EventFactory,
    FlightFactory,
    ImportJobFactory,
    SeriesFactory,
    UserFactory,
    persist,
)

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"


async def test_dashboard_aggregates(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from app.models.references import Currency, Organizer, Venue

    organizer = await db_session.get(Organizer, seed_organizer_id())
    venue = await db_session.get(Venue, seed_venue_id())
    currency = await db_session.get(Currency, "RUB")
    assert organizer is not None and venue is not None and currency is not None

    uploader = await persist(
        db_session,
        UserFactory(email=f"dash-up-{uuid4().hex[:8]}@example.com"),
    )
    empty_series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Empty Announced Series",
            status=SeriesStatus.ANNOUNCED,
            starts_on=date.today() + timedelta(days=10),
            ends_on=date.today() + timedelta(days=20),
        ),
    )
    job = await persist(
        db_session,
        ImportJobFactory(
            uploader=uploader,
            organizer=organizer,
            series=empty_series,
            status=ImportStatus.REVIEW,
            original_filename="empty.xlsx",
        ),
    )
    assert job.status == ImportStatus.REVIEW

    stale = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Stale Overdue Series",
            status=SeriesStatus.SCHEDULE_PUBLISHED,
            starts_on=date.today() - timedelta(days=30),
            ends_on=date.today() - timedelta(days=2),
        ),
    )

    running = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Running Now Series",
            status=SeriesStatus.RUNNING,
            starts_on=date.today() - timedelta(days=1),
            ends_on=date.today() + timedelta(days=5),
        ),
    )
    event = await persist(
        db_session,
        EventFactory(series=running, currency=currency, name="Dash Main", number=5),
    )
    flight = await persist(
        db_session,
        FlightFactory(
            event=event,
            label="Day 1A",
            start_at=datetime.now(UTC) + timedelta(hours=3),
        ),
    )
    fan = await persist(
        db_session,
        UserFactory(email=f"dash-fan-{uuid4().hex[:8]}@example.com"),
    )
    await persist(
        db_session,
        Bookmark(
            user_id=fan.id,
            target_type=BookmarkTarget.FLIGHT,
            target_id=flight.id,
            reminder_offsets=[60],
        ),
    )

    failed_user = await persist(
        db_session,
        UserFactory(email=f"dash-fail-{uuid4().hex[:8]}@example.com"),
    )
    db_session.add(
        NotificationQueue(
            user_id=failed_user.id,
            type=NotificationType.REMINDER,
            payload={"title": "x"},
            scheduled_at=datetime.now(UTC),
            status=NotificationStatus.FAILED,
            created_at=datetime.now(UTC),
        )
    )
    db_session.add(
        ChangeLog(
            entity_type="series",
            entity_id=running.id,
            change_type=ChangeType.UPDATED,
            old_value={"name": "old"},
            new_value={"name": "Running Now Series"},
            actor_id=uploader.id,
            created_at=datetime.now(UTC),
        )
    )
    await db_session.flush()

    response = await editor_client.get(f"{ADMIN}/dashboard")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["attention"]["imports_review"]["count"] >= 1
    assert any(item["id"] == str(job.id) for item in body["attention"]["imports_review"]["items"])
    assert body["attention"]["series_without_schedule"]["count"] >= 1
    assert any(
        item["id"] == str(empty_series.id)
        for item in body["attention"]["series_without_schedule"]["items"]
    )
    assert body["attention"]["push_failed_24h"]["count"] >= 1
    assert body["attention"]["stale_series"]["count"] >= 1
    assert any(item["id"] == str(stale.id) for item in body["attention"]["stale_series"]["items"])
    assert body["nav"]["imports_review_count"] == body["attention"]["imports_review"]["count"]
    assert body["kpis"]["active_series"]["running_now"] >= 1
    assert body["kpis"]["push_24h"]["failed"] >= 1
    assert any(item["event_id"] == str(event.id) for item in body["upcoming"])
    hit = next(item for item in body["upcoming"] if item["event_id"] == str(event.id))
    assert hit["subscribers"] >= 1
    assert len(body["recent_changes"]) >= 1

    filtered = await editor_client.get(
        f"{ADMIN}/series",
        params={"empty_events": "true", "status": "announced"},
    )
    assert filtered.status_code == 200
    assert any(item["id"] == str(empty_series.id) for item in filtered.json()["items"])

    stale_list = await editor_client.get(f"{ADMIN}/series", params={"stale": "true"})
    assert stale_list.status_code == 200
    assert any(item["id"] == str(stale.id) for item in stale_list.json()["items"])


async def test_dashboard_requires_editor(client: AsyncClient) -> None:
    response = await client.get(f"{ADMIN}/dashboard")
    assert response.status_code in {401, 403}
