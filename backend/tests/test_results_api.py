from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.references import FxRate
from app.models.schedule import Event, Flight
from app.models.tracker import Result
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import DEMO_EVENT_MAIN_ID, seed_demo_schedule
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _prepare(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_demo_schedule(db_session)
    db_session.add(
        FxRate(
            currency_code="EUR",
            rate_date=date(2024, 6, 1),
            rate_rub=Decimal("100.000000"),
        )
    )
    db_session.add(
        FxRate(
            currency_code="EUR",
            rate_date=date(2024, 5, 1),
            rate_rub=Decimal("100.000000"),
        )
    )
    await db_session.flush()


async def test_results_require_auth(client: AsyncClient, db_session: AsyncSession) -> None:
    await _prepare(db_session)
    response = await client.get("/api/v1/results")
    assert response.status_code == 401


async def test_linked_and_manual_crud_and_privacy(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    event = await db_session.get(Event, DEMO_EVENT_MAIN_ID)
    assert event is not None

    linked = await client.post(
        "/api/v1/results",
        json={
            "event_id": str(event.id),
            "played_on": "2024-05-01",
            "entries_count": 2,
            "payout": "120000.00",
            "place": 12,
            "field_size": 200,
            "note": "deep run",
        },
    )
    assert linked.status_code == 201, linked.text
    body = linked.json()
    assert body["event_id"] == str(event.id)
    assert body["buyin"] == "70000.00"
    assert body["currency_code"] == "RUB"
    assert body["entries_count"] == 2
    assert "Main Event" in body["name"]
    assert len([ev for ev in body["events"] if ev["type"] == "entry"]) == 1
    assert len([ev for ev in body["events"] if ev["type"] == "reentry"]) == 1
    assert any(ev["type"] == "note" and "deep run" in (ev["text"] or "") for ev in body["events"])
    linked_id = body["id"]

    manual = await client.post(
        "/api/v1/results",
        json={
            "name": "Home Game",
            "venue_text": "Minsk",
            "series_text": "Cash-ish",
            "played_on": "2024-06-01",
            "buyin": "100.00",
            "currency_code": "eur",
            "entries_count": 1,
            "payout": "0",
        },
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["currency_code"] == "EUR"
    manual_id = manual.json()["id"]

    listed = await client.get("/api/v1/results")
    assert listed.status_code == 200
    assert listed.json()["total"] == 2
    assert len(listed.json()["items"]) == 2
    manual_item = next(item for item in listed.json()["items"] if item["id"] == manual_id)
    assert manual_item["currency_code"] == "EUR"
    assert manual_item["base_currency"] == "RUB"
    assert manual_item["profit_base"] == "-10000.00"

    patched = await client.patch(
        f"/api/v1/results/{linked_id}",
        json={"payout": "150000.00", "entries_count": 3, "played_on": "2024-05-01"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["payout"] == "150000.00"
    assert patched.json()["entries_count"] == 3

    blocked = await client.patch(
        f"/api/v1/results/{linked_id}",
        json={"buyin": "1.00"},
    )
    assert blocked.status_code == 400

    deleted = await client.delete(f"/api/v1/results/{manual_id}")
    assert deleted.status_code == 204
    remaining = await db_session.scalar(select(Result).where(Result.id == manual_id))
    assert remaining is None

    # Other user cannot see/edit remaining result (ownership → 404).
    client.cookies.clear()
    await login_as(client, settings.seed_admin_email)
    foreign = await client.get(f"/api/v1/results/{linked_id}")
    assert foreign.status_code == 404
    foreign_patch = await client.patch(
        f"/api/v1/results/{linked_id}",
        json={"note": "nope"},
    )
    assert foreign_patch.status_code == 404

    listed_other = await client.get("/api/v1/results")
    assert listed_other.status_code == 200
    other_ids = {item["id"] for item in listed_other.json()["items"]}
    assert linked_id not in other_ids


async def test_result_validation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    future = (date.today() + timedelta(days=2)).isoformat()
    bad_future = await client.post(
        "/api/v1/results",
        json={
            "name": "Future",
            "played_on": future,
            "buyin": "10",
            "currency_code": "RUB",
        },
    )
    assert bad_future.status_code == 400

    bad_place = await client.post(
        "/api/v1/results",
        json={
            "name": "Place",
            "played_on": "2024-01-01",
            "buyin": "10",
            "currency_code": "RUB",
            "place": 10,
            "field_size": 5,
        },
    )
    assert bad_place.status_code == 422

    missing_manual = await client.post(
        "/api/v1/results",
        json={"name": "No date", "buyin": "10", "currency_code": "RUB"},
    )
    assert missing_manual.status_code == 400

    unknown_event = await client.post(
        "/api/v1/results",
        json={"event_id": str(uuid4()), "payout": "0"},
    )
    assert unknown_event.status_code == 404


async def test_results_pagination_newest_first(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    for day, name in (("2024-01-01", "A"), ("2024-03-01", "C"), ("2024-02-01", "B")):
        created = await client.post(
            "/api/v1/results",
            json={
                "name": name,
                "played_on": day,
                "buyin": "100",
                "currency_code": "RUB",
                "payout": "0",
            },
        )
        assert created.status_code == 201, created.text

    page = await client.get("/api/v1/results", params={"limit": 2, "offset": 0})
    assert page.status_code == 200
    items = page.json()["items"]
    assert page.json()["total"] == 3
    assert [item["name"] for item in items] == ["C", "B"]

    page2 = await client.get("/api/v1/results", params={"limit": 2, "offset": 2})
    assert [item["name"] for item in page2.json()["items"]] == ["A"]


async def test_results_filters_and_past_event_search(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    event = await db_session.scalar(select(Event).limit(1))
    assert event is not None
    flight = await db_session.scalar(select(Flight).where(Flight.event_id == event.id).limit(1))
    assert flight is not None
    flight.start_at = datetime.now(UTC) - timedelta(days=2)
    await db_session.flush()

    linked = await client.post(
        "/api/v1/results",
        json={
            "event_id": str(event.id),
            "played_on": "2024-05-01",
            "payout": "100000",
        },
    )
    assert linked.status_code == 201, linked.text
    manual = await client.post(
        "/api/v1/results",
        json={
            "name": "Small manual",
            "played_on": "2024-05-02",
            "buyin": "100",
            "currency_code": "RUB",
            "payout": "0",
        },
    )
    assert manual.status_code == 201, manual.text

    by_series = await client.get(
        "/api/v1/results",
        params={"series_id": str(event.series_id), "limit": 20},
    )
    assert by_series.status_code == 200, by_series.text
    assert by_series.json()["total"] == 1
    assert by_series.json()["items"][0]["event_id"] == str(event.id)

    by_buyin = await client.get(
        "/api/v1/results",
        params={"buyin_min": "1", "buyin_max": "1000", "limit": 20},
    )
    assert by_buyin.status_code == 200
    assert [item["name"] for item in by_buyin.json()["items"]] == ["Small manual"]

    search = await client.get(
        "/api/v1/results/search-events",
        params={"q": event.name[:4]},
    )
    assert search.status_code == 200, search.text
    match = next(item for item in search.json() if item["event_id"] == str(event.id))
    assert match["buyin"]
    assert match["currency_code"]
    assert match["series_name"]


async def test_result_events_snapshot_and_derived_entries(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    entry_id = str(uuid4())
    re_id = str(uuid4())
    note_id = str(uuid4())
    occurred = "2024-06-01T12:00:00+00:00"

    created = await client.post(
        "/api/v1/results",
        json={
            "name": "Chronology",
            "played_on": "2024-06-01",
            "buyin": "1000",
            "currency_code": "RUB",
            "payout": "0",
            "events": [
                {
                    "id": entry_id,
                    "type": "entry",
                    "amount": "1000",
                    "currency_code": "RUB",
                    "occurred_at": occurred,
                },
                {
                    "id": re_id,
                    "type": "reentry",
                    "amount": "1200",
                    "currency_code": "RUB",
                    "occurred_at": "2024-06-01T13:00:00+00:00",
                },
                {
                    "id": note_id,
                    "type": "note",
                    "text": "Bubble",
                    "occurred_at": "2024-06-01T14:00:00+00:00",
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["entries_count"] == 2
    assert len(body["events"]) == 3

    bad = await client.patch(
        f"/api/v1/results/{body['id']}",
        json={
            "events": [
                {
                    "id": str(uuid4()),
                    "type": "reentry",
                    "amount": "1000",
                    "currency_code": "RUB",
                    "occurred_at": occurred,
                }
            ]
        },
    )
    assert bad.status_code == 400

    patched = await client.patch(
        f"/api/v1/results/{body['id']}",
        json={
            "events": [
                {
                    "id": entry_id,
                    "type": "entry",
                    "amount": "1000",
                    "currency_code": "RUB",
                    "occurred_at": occurred,
                }
            ]
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["entries_count"] == 1
    assert len(patched.json()["events"]) == 1

    note_again = str(uuid4())
    with_note = await client.patch(
        f"/api/v1/results/{body['id']}",
        json={
            "events": [
                {
                    "id": entry_id,
                    "type": "entry",
                    "amount": "1000",
                    "currency_code": "RUB",
                    "occurred_at": occurred,
                },
                {
                    "id": note_again,
                    "type": "note",
                    "text": "Бабл",
                    "occurred_at": "2024-06-01T14:00:00+00:00",
                },
            ]
        },
    )
    assert with_note.status_code == 200, with_note.text
    assert any(ev["type"] == "note" and ev["text"] == "Бабл" for ev in with_note.json()["events"])
    fetched = await client.get(f"/api/v1/results/{body['id']}")
    assert fetched.status_code == 200
    assert any(ev["type"] == "note" and ev["text"] == "Бабл" for ev in fetched.json()["events"])
