from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ChangeType
from app.models.schedule import ChangeLog
from app.seeds.data import VENUES
from app.seeds.dev_users import EDITOR_USER_ID
from tests.conftest import seed_organizer_id, seed_venue_id

pytestmark = pytest.mark.integration

ADMIN_PREFIX = "/api/v1/admin"


def _series_payload(
    *,
    venue_index: int = 0,
    starts_on: date | None = None,
    ends_on: date | None = None,
    name: str = "Admin Schedule Series",
) -> dict[str, object]:
    start = starts_on or date(2026, 8, 1)
    end = ends_on or date(2026, 8, 7)
    return {
        "organizer_id": str(seed_organizer_id()),
        "venue_id": str(seed_venue_id(venue_index)),
        "name": name,
        "starts_on": start.isoformat(),
        "ends_on": end.isoformat(),
    }


def _event_payload(*, number: int = 1, name: str = "Main Event") -> dict[str, object]:
    return {
        "number": number,
        "name": name,
        "buyin": "10000.00",
        "currency_code": "RUB",
        "start_stack": 30000,
        "reentry_count": 1,
        "late_reg_level": 6,
    }


async def _create_series(client: AsyncClient, **overrides: object) -> dict[str, object]:
    body = _series_payload(**overrides)  # type: ignore[arg-type]
    response = await client.post(f"{ADMIN_PREFIX}/series", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def _create_event(
    client: AsyncClient,
    series_id: str,
    **overrides: object,
) -> dict[str, object]:
    body = _event_payload(**overrides)  # type: ignore[arg-type]
    response = await client.post(f"{ADMIN_PREFIX}/series/{series_id}/events", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def _preview_patch_series(
    client: AsyncClient,
    series_id: str,
    body: dict[str, object],
) -> object:
    preview = await client.post(f"{ADMIN_PREFIX}/series/{series_id}/preview", json=body)
    assert preview.status_code == 200, preview.text
    token = preview.json()["preview_token"]
    return await client.patch(
        f"{ADMIN_PREFIX}/series/{series_id}",
        json=body,
        headers={"X-Preview-Token": token},
    )


async def _preview_patch_event(
    client: AsyncClient,
    event_id: str,
    body: dict[str, object],
) -> object:
    preview = await client.post(f"{ADMIN_PREFIX}/events/{event_id}/preview", json=body)
    assert preview.status_code == 200, preview.text
    token = preview.json()["preview_token"]
    return await client.patch(
        f"{ADMIN_PREFIX}/events/{event_id}",
        json=body,
        headers={"X-Preview-Token": token},
    )


async def _preview_put_flights(
    client: AsyncClient,
    event_id: str,
    body: list[dict[str, object]],
) -> object:
    preview = await client.post(f"{ADMIN_PREFIX}/events/{event_id}/flights/preview", json=body)
    assert preview.status_code == 200, preview.text
    token = preview.json()["preview_token"]
    return await client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=body,
        headers={"X-Preview-Token": token},
    )


async def _change_logs(
    db_session: AsyncSession,
    *,
    entity_id: UUID,
    change_type: ChangeType | None = None,
) -> list[ChangeLog]:
    stmt = select(ChangeLog).where(ChangeLog.entity_id == entity_id).order_by(ChangeLog.created_at)
    if change_type is not None:
        stmt = stmt.where(ChangeLog.change_type == change_type)
    return list(await db_session.scalars(stmt))


async def test_editor_can_manage_draft_schedule(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(editor_client)
    assert series["status"] == "announced"

    event = await _create_event(editor_client, series["id"])
    event_id = event["id"]

    flights = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )
    assert flights.status_code == 200
    assert len(flights.json()) == 1
    assert flights.json()[0]["label"] is None

    blinds = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/blind-levels",
        json=[
            {
                "level_no": 1,
                "sb": 100,
                "bb": 200,
                "ante": 200,
                "minutes": 20,
            }
        ],
    )
    assert blinds.status_code == 200
    assert len(blinds.json()) == 1


async def test_publish_series_writes_schedule_published_change_log(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series = await _create_series(editor_client, name="Publish Test Series")
    series_id = UUID(series["id"])

    publish = await _preview_patch_series(
        editor_client,
        str(series_id),
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200
    assert publish.json()["status"] == "schedule_published"

    entries = await _change_logs(
        db_session,
        entity_id=series_id,
        change_type=ChangeType.SCHEDULE_PUBLISHED,
    )
    assert len(entries) == 1
    entry = entries[0]
    assert entry.entity_type == "series"
    assert entry.actor_id == EDITOR_USER_ID
    assert entry.old_value is not None
    assert entry.new_value is not None
    assert entry.old_value.get("status") == "announced"
    assert entry.new_value.get("status") == "schedule_published"


async def test_update_published_event_writes_change_log(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series = await _create_series(editor_client, name="Event Update Series")
    event = await _create_event(editor_client, series["id"], name="Before Update")
    event_id = UUID(event["id"])

    await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )
    publish = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200

    updated = await _preview_patch_event(
        editor_client,
        str(event_id),
        {"name": "After Update"},
    )
    assert updated.status_code == 200

    entries = await _change_logs(
        db_session,
        entity_id=event_id,
        change_type=ChangeType.UPDATED,
    )
    assert len(entries) == 1
    assert entries[0].entity_type == "event"
    assert entries[0].old_value == {"name": "Before Update"}
    assert entries[0].new_value == {"name": "After Update"}


async def test_blind_levels_update_on_published_event_logs_once(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series = await _create_series(editor_client, name="Blinds Log Series")
    event = await _create_event(editor_client, series["id"])
    event_id = UUID(event["id"])

    await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )
    blinds_resp = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/blind-levels",
        json=[
            {
                "level_no": 1,
                "sb": 100,
                "bb": 200,
                "ante": 200,
                "minutes": 20,
            }
        ],
    )
    level_id = blinds_resp.json()[0]["id"]

    publish = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200

    updated_blinds = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/blind-levels",
        json=[
            {
                "id": level_id,
                "level_no": 1,
                "sb": 200,
                "bb": 400,
                "ante": 400,
                "minutes": 20,
            }
        ],
    )
    assert updated_blinds.status_code == 200

    entries = await _change_logs(
        db_session,
        entity_id=event_id,
        change_type=ChangeType.UPDATED,
    )
    assert len(entries) == 1
    assert "blind_levels" in (entries[0].old_value or {})
    assert "blind_levels" in (entries[0].new_value or {})
    old_levels = entries[0].old_value["blind_levels"]  # type: ignore[index]
    new_levels = entries[0].new_value["blind_levels"]  # type: ignore[index]
    assert old_levels[0]["sb"] == 100
    assert new_levels[0]["sb"] == 200


async def test_cannot_hard_delete_published_event_or_series_with_bookmarks(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from app.models.enums import BookmarkTarget
    from tests.factories import BookmarkFactory, UserFactory, persist

    series = await _create_series(editor_client, name="No Hard Delete Series")
    event = await _create_event(editor_client, series["id"])
    await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )
    publish = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200

    delete_event = await editor_client.delete(f"{ADMIN_PREFIX}/events/{event['id']}")
    assert delete_event.status_code == 409

    user = await persist(db_session, UserFactory())
    await persist(
        db_session,
        BookmarkFactory(
            user=user,
            user_id=user.id,
            target_type=BookmarkTarget.SERIES,
            target_id=UUID(series["id"]),
        ),
    )

    delete_series = await editor_client.delete(f"{ADMIN_PREFIX}/series/{series['id']}")
    assert delete_series.status_code == 409
    assert "закладок" in delete_series.json()["error"]["message"]


async def test_published_series_without_bookmarks_can_be_deleted(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(editor_client, name="Published Deletable")
    event = await _create_event(editor_client, series["id"])
    await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )
    publish = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200

    delete_series = await editor_client.delete(f"{ADMIN_PREFIX}/series/{series['id']}")
    assert delete_series.status_code == 204

    gone = await editor_client.get(f"{ADMIN_PREFIX}/series/{series['id']}")
    assert gone.status_code == 404


async def test_schedule_published_can_jump_to_finished(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(editor_client, name="Jump To Finished")
    event = await _create_event(editor_client, series["id"])
    await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )
    publish = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200

    finished = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "finished"},
    )
    assert finished.status_code == 200
    assert finished.json()["status"] == "finished"

async def test_cannot_remove_flight_from_published_event(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(editor_client, name="Flight Guard Series")
    event = await _create_event(editor_client, series["id"])
    event_id = event["id"]

    flights = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=[
            {"label": "A", "start_at": "2026-08-02T15:00:00"},
            {"label": "B", "start_at": "2026-08-02T19:00:00"},
        ],
    )
    flight_a_id = flights.json()[0]["id"]

    publish = await _preview_patch_series(
        editor_client,
        series["id"],
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200

    removed_body: list[dict[str, object]] = [{"id": flight_a_id, "start_at": "2026-08-02T15:00:00"}]
    preview = await editor_client.post(
        f"{ADMIN_PREFIX}/events/{event_id}/flights/preview",
        json=removed_body,
    )
    assert preview.status_code == 409
    assert "cannot be removed" in preview.json()["error"]["message"].lower()

    removed = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=removed_body,
    )
    assert removed.status_code == 409
    assert "cannot be removed" in removed.json()["error"]["message"].lower()


async def test_series_status_forward_only_and_cancel_from_announced(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(editor_client, name="Status Transitions Series")
    series_id = series["id"]

    cancel = await _preview_patch_series(
        editor_client,
        series_id,
        {"status": "cancelled"},
    )
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    series2 = await _create_series(editor_client, name="Forward Only Series")
    series2_id = series2["id"]
    event = await _create_event(editor_client, series2_id)
    await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-08-02T15:00:00"}],
    )

    publish = await _preview_patch_series(
        editor_client,
        series2_id,
        {"status": "schedule_published"},
    )
    assert publish.status_code == 200
    running = await _preview_patch_series(
        editor_client,
        series2_id,
        {"status": "running"},
    )
    assert running.status_code == 200
    finished = await _preview_patch_series(
        editor_client,
        series2_id,
        {"status": "finished"},
    )
    assert finished.status_code == 200

    backward = await editor_client.patch(
        f"{ADMIN_PREFIX}/series/{series2_id}",
        json={"status": "running"},
    )
    assert backward.status_code == 400
    assert "Invalid series status transition" in backward.json()["error"]["message"]


async def test_flight_timezone_roundtrip(editor_client: AsyncClient) -> None:
    kaliningrad_id = VENUES[2]["id"]
    series = await _create_series(
        editor_client,
        venue_index=2,
        name="Timezone Series",
    )
    assert series["venue_id"] == str(kaliningrad_id)

    event = await _create_event(editor_client, series["id"])
    local_start = "2026-08-02T18:30:00"
    flights = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": local_start}],
    )
    assert flights.status_code == 200
    flight = flights.json()[0]
    assert flight["start_at"]["venue_local"].startswith("2026-08-02T18:30:00")
    assert flight["start_at"]["venue_timezone"] == "Europe/Kaliningrad"

    expected_utc = (
        datetime.fromisoformat(local_start)
        .replace(tzinfo=ZoneInfo("Europe/Kaliningrad"))
        .astimezone(ZoneInfo("UTC"))
        .isoformat()
        .replace("+00:00", "Z")
    )
    assert flight["start_at"]["utc"].replace("+00:00", "Z") == expected_utc


async def test_flight_date_must_be_within_series_range(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(
        editor_client,
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 3),
        name="Range Guard Series",
    )
    event = await _create_event(editor_client, series["id"])

    too_early = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-07-31T12:00:00"}],
    )
    assert too_early.status_code == 400
    assert "outside series range" in too_early.json()["error"]["message"]

    too_late = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event['id']}/flights",
        json=[{"start_at": "2026-08-05T12:00:00"}],
    )
    assert too_late.status_code == 400


async def test_event_validation_errors(editor_client: AsyncClient) -> None:
    series = await _create_series(editor_client, name="Validation Series")
    series_id = series["id"]

    await _create_event(editor_client, series_id, number=1, name="First Event")

    duplicate_number = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series_id}/events",
        json=_event_payload(number=1, name="Duplicate Number"),
    )
    assert duplicate_number.status_code == 409

    zero_buyin = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series_id}/events",
        json={
            "name": "Zero Buyin",
            "buyin": "0",
            "currency_code": "RUB",
        },
    )
    assert zero_buyin.status_code == 201
    assert Decimal(zero_buyin.json()["buyin"]) == Decimal("0")

    negative_buyin = await editor_client.post(
        f"{ADMIN_PREFIX}/series/{series_id}/events",
        json={
            "name": "Negative Buyin",
            "buyin": "-100",
            "currency_code": "RUB",
        },
    )
    assert negative_buyin.status_code == 422


async def test_announced_series_and_event_can_be_deleted(
    editor_client: AsyncClient,
) -> None:
    series = await _create_series(editor_client, name="Deletable Series")
    event = await _create_event(editor_client, series["id"])

    delete_event = await editor_client.delete(f"{ADMIN_PREFIX}/events/{event['id']}")
    assert delete_event.status_code == 204

    delete_series = await editor_client.delete(f"{ADMIN_PREFIX}/series/{series['id']}")
    assert delete_series.status_code == 204


async def test_event_flight_bookmarks_and_changes_and_duplicate(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from app.models.enums import BookmarkTarget
    from tests.factories import BookmarkFactory, UserFactory, persist

    series = await _create_series(editor_client, name="Dup Series")
    event = await _create_event(editor_client, series["id"], name="Main Event", number=5)
    event_id = event["id"]

    flights = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/flights",
        json=[
            {"label": "1A", "start_at": "2026-08-02T20:00:00"},
            {"label": "1B", "start_at": "2026-08-03T20:00:00"},
        ],
    )
    assert flights.status_code == 200
    flight_a = flights.json()[0]
    flight_b = flights.json()[1]

    blinds = await editor_client.put(
        f"{ADMIN_PREFIX}/events/{event_id}/blind-levels",
        json=[
            {"level_no": 1, "sb": 100, "bb": 200, "ante": 200, "minutes": 40},
            {
                "level_no": 2,
                "sb": None,
                "bb": None,
                "ante": None,
                "minutes": 15,
                "is_break": True,
            },
        ],
    )
    assert blinds.status_code == 200

    user_a = await persist(db_session, UserFactory(email="bm-a@example.com"))
    user_b = await persist(db_session, UserFactory(email="bm-b@example.com"))
    user_c = await persist(db_session, UserFactory(email="bm-c@example.com"))
    await persist(
        db_session,
        BookmarkFactory(
            user=user_a,
            user_id=user_a.id,
            target_type=BookmarkTarget.FLIGHT,
            target_id=UUID(flight_a["id"]),
        ),
    )
    await persist(
        db_session,
        BookmarkFactory(
            user=user_b,
            user_id=user_b.id,
            target_type=BookmarkTarget.FLIGHT,
            target_id=UUID(flight_a["id"]),
        ),
    )
    await persist(
        db_session,
        BookmarkFactory(
            user=user_c,
            user_id=user_c.id,
            target_type=BookmarkTarget.FLIGHT,
            target_id=UUID(flight_b["id"]),
        ),
    )

    detail = await editor_client.get(f"{ADMIN_PREFIX}/events/{event_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["bookmarks_count"] == 3
    by_label = {f["label"]: f["bookmarks_count"] for f in body["flights"]}
    assert by_label["1A"] == 2
    assert by_label["1B"] == 1

    changes = await editor_client.get(f"{ADMIN_PREFIX}/events/{event_id}/changes")
    assert changes.status_code == 200
    assert isinstance(changes.json(), list)

    dup = await editor_client.post(f"{ADMIN_PREFIX}/events/{event_id}/duplicate")
    assert dup.status_code == 200, dup.text
    copy = dup.json()
    assert copy["id"] != event_id
    assert copy["name"] == "Main Event (копия)"
    assert copy["number"] is None
    assert copy["status"] == "scheduled"
    assert len(copy["flights"]) == 2
    assert len(copy["blind_levels"]) == 2
    assert copy["bookmarks_count"] == 0
    assert all(f["bookmarks_count"] == 0 for f in copy["flights"])
    assert all(f["id"] not in {flight_a["id"], flight_b["id"]} for f in copy["flights"])
