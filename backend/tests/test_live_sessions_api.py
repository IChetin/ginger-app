from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.live import LiveEvent
from app.models.tracker import Result
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import seed_demo_schedule
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _prepare(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_demo_schedule(db_session)


async def _login_player(client: AsyncClient, db_session: AsyncSession) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    await login_as(client, get_settings().seed_editor_email)


async def test_manual_session_idempotent_events_finish_and_one_active(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _login_player(client, db_session)

    session_id = str(uuid4())
    entry_id = str(uuid4())
    re1 = str(uuid4())
    re2 = str(uuid4())
    note_id = str(uuid4())
    now = datetime.now(UTC).isoformat()

    created = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": session_id,
            "manual_name": "Sunday Special",
            "manual_venue": "Local Club",
            "manual_buyin": "44000",
            "manual_currency": "RUB",
            "started_at": now,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "active"
    assert Decimal(created.json()["buyin"]) == Decimal("44000")
    events = created.json()["events"]
    assert len(events) == 1
    assert events[0]["type"] == "entry"
    assert Decimal(events[0]["amount"]) == Decimal("44000")

    replay = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": session_id,
            "manual_name": "Sunday Special",
            "manual_buyin": "44000",
            "manual_currency": "RUB",
            "started_at": now,
        },
    )
    assert replay.status_code == 200, replay.text

    other = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": str(uuid4()),
            "manual_name": "Other",
            "manual_buyin": "1000",
            "manual_currency": "RUB",
            "started_at": now,
        },
    )
    assert other.status_code == 409, other.text
    assert other.json()["error"]["active_session_id"] == session_id

    batch = await client.post(
        f"/api/v1/live-sessions/{session_id}/events",
        json={
            "events": [
                {
                    "id": entry_id,
                    "type": "entry",
                    "amount": "44000",
                    "occurred_at": now,
                },
                {
                    "id": re1,
                    "type": "reentry",
                    "amount": "44000",
                    "occurred_at": now,
                },
                {
                    "id": re2,
                    "type": "reentry",
                    "amount": "44000",
                    "occurred_at": now,
                },
                {
                    "id": note_id,
                    "type": "note",
                    "text": "Aggressive player on left",
                    "occurred_at": now,
                },
            ]
        },
    )
    assert batch.status_code == 200, batch.text
    assert len(batch.json()["events"]) == 4

    batch_again = await client.post(
        f"/api/v1/live-sessions/{session_id}/events",
        json={
            "events": [
                {
                    "id": entry_id,
                    "type": "entry",
                    "amount": "44000",
                    "occurred_at": now,
                },
                {
                    "id": re1,
                    "type": "reentry",
                    "amount": "44000",
                    "occurred_at": now,
                },
            ]
        },
    )
    assert batch_again.status_code == 200
    assert len(batch_again.json()["events"]) == 4
    event_count = await db_session.scalar(
        select(func.count())
        .select_from(LiveEvent)
        .where(LiveEvent.session_id == created.json()["id"])
    )
    assert event_count == 4

    patched = await client.patch(
        f"/api/v1/live-events/{re1}",
        json={"amount": "40000"},
    )
    assert patched.status_code == 200, patched.text
    amounts = {
        item["id"]: item["amount"]
        for item in patched.json()["events"]
        if item["type"] != "note"
    }
    assert amounts[re1] == "40000" or amounts[re1] == "40000.00"
    assert Decimal(amounts[re1]) == Decimal("40000")

    finish = await client.post(
        f"/api/v1/live-sessions/{session_id}/finish",
        json={
            "in_the_money": True,
            "place": 12,
            "field_size": 418,
            "payout": "285000",
        },
    )
    assert finish.status_code == 200, finish.text
    body = finish.json()
    assert body["status"] == "finished"
    assert body["result_id"] is not None

    result = await db_session.get(Result, body["result_id"])
    assert result is not None
    assert result.entries_count == 3
    assert result.payout == Decimal("285000.00")
    assert result.place == 12
    assert result.field_size == 418
    assert result.buyin == Decimal("44000.00")
    assert result.name == "Sunday Special"

    result_read = await client.get(f"/api/v1/results/{body['result_id']}")
    assert result_read.status_code == 200, result_read.text
    result_events = result_read.json()["events"]
    money_types = [ev["type"] for ev in result_events if ev["type"] in ("entry", "reentry")]
    assert money_types.count("entry") == 1
    assert money_types.count("reentry") == 2
    assert any(ev["type"] == "note" for ev in result_events)

    finish_again = await client.post(
        f"/api/v1/live-sessions/{session_id}/finish",
        json={"in_the_money": True, "place": 1, "payout": "1"},
    )
    assert finish_again.status_code == 200
    assert finish_again.json()["result_id"] == body["result_id"]

    active = await client.get("/api/v1/live-sessions/active")
    assert active.status_code == 404


async def test_cannot_delete_last_entry_and_cancel(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _login_player(client, db_session)
    session_id = str(uuid4())
    now = datetime.now(UTC).isoformat()

    created = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": session_id,
            "manual_name": "Freezeout",
            "manual_buyin": "2300",
            "manual_currency": "RUB",
            "started_at": now,
        },
    )
    assert created.status_code == 201
    entry_id = next(item["id"] for item in created.json()["events"] if item["type"] == "entry")

    deleted = await client.delete(f"/api/v1/live-events/{entry_id}")
    assert deleted.status_code == 400

    cancelled = await client.post(f"/api/v1/live-sessions/{session_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["result_id"] is None

    results_count = await db_session.scalar(select(func.count()).select_from(Result))
    assert results_count == 0

    closed_events = await client.post(
        f"/api/v1/live-sessions/{session_id}/events",
        json={
            "events": [
                {
                    "id": str(uuid4()),
                    "type": "note",
                    "text": "late",
                    "occurred_at": now,
                }
            ]
        },
    )
    assert closed_events.status_code == 409


async def test_linked_session_from_demo_event(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _login_player(client, db_session)
    from app.models.schedule import Event, Flight

    event = await db_session.scalar(select(Event).limit(1))
    assert event is not None
    flight = await db_session.scalar(select(Flight).where(Flight.event_id == event.id).limit(1))
    assert flight is not None

    session_id = str(uuid4())
    entry_id = str(uuid4())
    now = datetime.now(UTC).isoformat()

    created = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": session_id,
            "event_id": str(event.id),
            "flight_id": str(flight.id),
            "started_at": now,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["event_id"] == str(event.id)
    assert Decimal(created.json()["buyin"]) == event.buyin
    assert any(item["type"] == "entry" for item in created.json()["events"])

    await client.post(
        f"/api/v1/live-sessions/{session_id}/events",
        json={
            "events": [
                {
                    "id": entry_id,
                    "type": "entry",
                    "amount": str(event.buyin),
                    "occurred_at": now,
                }
            ]
        },
    )
    finish = await client.post(
        f"/api/v1/live-sessions/{session_id}/finish",
        json={"in_the_money": False},
    )
    assert finish.status_code == 200, finish.text
    result = await db_session.get(Result, finish.json()["result_id"])
    assert result is not None
    assert result.event_id == event.id
    assert result.entries_count == 1
    assert result.payout == Decimal("0")


async def test_finish_allows_venue_local_played_on_ahead_of_utc_date(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Venue calendar day can be ahead of UTC; finish must still write a result."""
    await _login_player(client, db_session)
    from zoneinfo import ZoneInfo

    from app.models.schedule import Event, Flight, Series
    from app.utils.timezone import venue_local_to_utc

    event = await db_session.scalar(select(Event).limit(1))
    assert event is not None
    series = await db_session.get(Series, event.series_id)
    assert series is not None
    await db_session.refresh(series, attribute_names=["venue"])
    series.venue.timezone = "Europe/Minsk"
    await db_session.flush()

    flight = await db_session.scalar(select(Flight).where(Flight.event_id == event.id).limit(1))
    assert flight is not None

    venue_tz = ZoneInfo("Europe/Minsk")
    venue_now = datetime.now(venue_tz)
    # 00:30 venue-local today → previous calendar day in UTC when offset is +3
    local_start = venue_now.replace(hour=0, minute=30, second=0, microsecond=0)
    flight.start_at = venue_local_to_utc(local_start.replace(tzinfo=None), "Europe/Minsk")
    await db_session.commit()

    session_id = str(uuid4())
    started = local_start.astimezone(UTC).isoformat()
    created = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": session_id,
            "event_id": str(event.id),
            "flight_id": str(flight.id),
            "started_at": started,
        },
    )
    assert created.status_code == 201, created.text

    finish = await client.post(
        f"/api/v1/live-sessions/{session_id}/finish",
        json={"in_the_money": False},
    )
    assert finish.status_code == 200, finish.text
    assert finish.json()["status"] == "finished"
    assert finish.json()["result_id"] is not None
    result = await db_session.get(Result, finish.json()["result_id"])
    assert result is not None
    assert result.played_on == local_start.date()


async def test_create_resumes_active_session_for_same_event(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _login_player(client, db_session)
    from app.models.schedule import Event, Flight

    event = await db_session.scalar(select(Event).limit(1))
    assert event is not None
    flight = await db_session.scalar(select(Flight).where(Flight.event_id == event.id).limit(1))
    assert flight is not None
    now = datetime.now(UTC).isoformat()

    first_id = str(uuid4())
    first = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": first_id,
            "event_id": str(event.id),
            "flight_id": str(flight.id),
            "started_at": now,
        },
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": str(uuid4()),
            "event_id": str(event.id),
            "flight_id": str(flight.id),
            "started_at": now,
        },
    )
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first_id
    assert second.json()["status"] == "active"


async def test_create_rejects_when_finished_result_exists(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _login_player(client, db_session)
    from app.models.schedule import Event, Flight

    event = await db_session.scalar(select(Event).limit(1))
    assert event is not None
    flight = await db_session.scalar(select(Flight).where(Flight.event_id == event.id).limit(1))
    assert flight is not None
    now = datetime.now(UTC).isoformat()

    session_id = str(uuid4())
    created = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": session_id,
            "event_id": str(event.id),
            "flight_id": str(flight.id),
            "started_at": now,
        },
    )
    assert created.status_code == 201, created.text
    finish = await client.post(
        f"/api/v1/live-sessions/{session_id}/finish",
        json={"in_the_money": False},
    )
    assert finish.status_code == 200, finish.text
    result_id = finish.json()["result_id"]
    assert result_id

    again = await client.post(
        "/api/v1/live-sessions",
        json={
            "id": str(uuid4()),
            "event_id": str(event.id),
            "flight_id": str(flight.id),
            "started_at": now,
        },
    )
    assert again.status_code == 409, again.text
    assert again.json()["error"]["result_id"] == result_id


async def test_candidates_include_schedule_published_series_today(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """«Идут» = schedule_published + даты, не только DB enum running."""
    await _login_player(client, db_session)
    from zoneinfo import ZoneInfo

    from app.models.enums import SeriesStatus
    from app.models.schedule import Event, Flight, Series
    from app.utils.timezone import venue_local_to_utc

    event = await db_session.scalar(
        select(Event)
        .join(Series, Event.series_id == Series.id)
        .limit(1)
    )
    assert event is not None
    series = await db_session.get(Series, event.series_id)
    assert series is not None
    await db_session.refresh(series, attribute_names=["venue"])

    flight = await db_session.scalar(select(Flight).where(Flight.event_id == event.id).limit(1))
    assert flight is not None

    today = datetime.now(ZoneInfo(series.venue.timezone)).date()
    series.status = SeriesStatus.SCHEDULE_PUBLISHED
    series.starts_on = today
    series.ends_on = today
    flight.start_at = venue_local_to_utc(
        datetime(today.year, today.month, today.day, 18, 0),
        series.venue.timezone,
    )
    await db_session.commit()

    response = await client.get("/api/v1/live-sessions/candidates")
    assert response.status_code == 200, response.text
    flight_ids = {item["flight_id"] for item in response.json()}
    assert str(flight.id) in flight_ids

    by_event = await client.get(
        "/api/v1/live-sessions/candidates",
        params={"event_id": str(event.id)},
    )
    assert by_event.status_code == 200, by_event.text
    assert str(flight.id) in {item["flight_id"] for item in by_event.json()}
