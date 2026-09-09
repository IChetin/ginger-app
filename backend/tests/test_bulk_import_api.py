"""Массовая загрузка серий из Excel: загрузка, предпросмотр, публикация."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import ChangeType, EventStatus, NotificationType, SeriesStatus
from app.models.notifications import NotificationQueue
from app.models.references import Organizer, Venue
from app.models.schedule import ChangeLog, Event, Flight, Series
from app.utils.timezone import to_venue_local
from tests.bulk_fixtures import build_workbook, default_rows, template_bytes
from tests.conftest import login_as

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
BULK = f"{ADMIN}/import/bulk"


async def upload(client: AsyncClient, rows: list[dict[str, Any]] | bytes) -> dict[str, Any]:
    data = rows if isinstance(rows, bytes) else build_workbook(rows)
    response = await client.post(
        BULK,
        files={
            "file": (
                "series.xlsx",
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def preview(
    client: AsyncClient,
    job_id: str,
    *,
    mark_missing_cancelled: bool = False,
) -> dict[str, Any]:
    response = await client.post(
        f"{BULK}/{job_id}/preview",
        params={"mark_missing_cancelled": mark_missing_cancelled},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def publish(
    client: AsyncClient,
    job_id: str,
    token: str,
    *,
    mark_missing_cancelled: bool = False,
    notify: bool | None = None,
) -> dict[str, Any]:
    headers = {"X-Preview-Token": token}
    if notify is not None:
        headers["X-Notify"] = "1" if notify else "0"
    response = await client.post(
        f"{BULK}/{job_id}/publish",
        params={"mark_missing_cancelled": mark_missing_cancelled},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def upload_and_publish(
    client: AsyncClient,
    rows: list[dict[str, Any]],
    *,
    mark_missing_cancelled: bool = False,
    notify: bool | None = None,
) -> dict[str, Any]:
    job = await upload(client, rows)
    view = await preview(client, job["id"], mark_missing_cancelled=mark_missing_cancelled)
    assert view["can_publish"] is True, view["issues"]
    return await publish(
        client,
        job["id"],
        view["preview_token"],
        mark_missing_cancelled=mark_missing_cancelled,
        notify=notify,
    )


def find_series_plan(view: dict[str, Any], import_key: str) -> dict[str, Any]:
    return next(item for item in view["plans"] if item["import_key"] == import_key)


async def test_upload_creates_series_events_and_flights(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    report = (await upload_and_publish(editor_client, default_rows()))["report"]

    assert report["series_created"] == 2
    assert report["events_created"] == 3
    assert report["flights_created"] == 5
    assert report["organizers_created"] == ["Test BPT", "Test RPT"]
    assert sorted(report["venues_created"]) == ["Test Casino Opera", "Test Sobranie Poker Club"]

    series = await db_session.scalar(
        select(Series).where(Series.import_key == "test-rpt-kaliningrad")
    )
    assert series is not None
    assert series.status is SeriesStatus.SCHEDULE_PUBLISHED
    assert series.name == "Test RPT Kaliningrad"
    assert str(series.guarantee) == "35000000.00"
    assert series.guarantee_currency_code == "RUB"
    assert series.links == {"source": "https://t.me/rpt_poker/1234"}

    events = list(
        await db_session.scalars(
            select(Event).where(Event.series_id == series.id).order_by(Event.number)
        )
    )
    assert [item.import_key for item in events] == ["4", "5"]
    knockout, main = events
    assert str(knockout.buyin) == "14000.00"
    assert str(knockout.buyin_bounty) == "6000.00"
    assert knockout.tags == ["bounty", "pko"]
    assert knockout.day_end_note == "till 12%"
    assert knockout.start_blinds == "100/200/200"
    assert main.notes == "Трансляция на канале серии"

    flights = list(
        await db_session.scalars(
            select(Flight).where(Flight.event_id == knockout.id).order_by(Flight.start_at)
        )
    )
    assert [item.label for item in flights] == ["Day 1A", "Day 1B"]
    assert [item.level_minutes for item in flights] == ["30", "30"]
    local = to_venue_local(flights[0].start_at, "Europe/Kaliningrad")
    assert (local.hour, local.minute) == (12, 0)


async def test_second_upload_of_same_file_changes_nothing(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    job = await upload(editor_client, default_rows())
    view = await preview(editor_client, job["id"])

    assert view["series"] == {"created": 0, "updated": 0, "unchanged": 2, "missing": 0}
    assert view["events"] == {"created": 0, "updated": 0, "unchanged": 3, "missing": 0}
    assert view["flights"] == {"created": 0, "updated": 0, "unchanged": 5, "missing": 0}
    assert view["total_recipients"] == 0
    assert view["new_references"] == {"organizers": [], "venues": [], "countries": []}

    report = (await publish(editor_client, job["id"], view["preview_token"]))["report"]
    assert report["series_created"] == 0
    assert report["series_updated"] == 0
    assert report["events_created"] == 0
    assert report["events_updated"] == 0

    assert await db_session.scalar(select(func.count()).select_from(Series)) == 2
    assert await db_session.scalar(select(func.count()).select_from(Event)) == 3
    assert await db_session.scalar(select(func.count()).select_from(Flight)) == 5


async def test_time_change_shows_diff_and_affected_subscribers(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    flight = await db_session.scalar(
        select(Flight).join(Event).where(Event.import_key == "4", Flight.label == "Day 1B")
    )
    assert flight is not None
    await login_as(client, get_settings().seed_admin_email)
    bookmark = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "flight", "target_id": str(flight.id)},
    )
    assert bookmark.status_code == 201, bookmark.text

    rows = default_rows()
    rows[1]["time"] = "20:00"
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    plan = find_series_plan(view, "test-rpt-kaliningrad")
    assert plan["action"] == "update"
    event_plan = next(item for item in plan["events"] if item["import_key"] == "4")
    flight_plan = next(item for item in event_plan["flights"] if item["label"] == "Day 1B")
    assert flight_plan["action"] == "update"
    assert flight_plan["diffs"] == [
        {"field": "start_at", "label": "время", "old_value": "18:00", "new_value": "20:00"}
    ]
    assert event_plan["recipients"] == 1
    assert view["total_recipients"] == 1
    assert [item["type"] for item in view["impacts"]] == [NotificationType.TIME_CHANGED.value]

    report = (await publish(editor_client, job["id"], view["preview_token"]))["report"]
    assert report["flights_updated"] == 1
    assert report["notifications_enqueued"] == 1

    await db_session.refresh(flight)
    assert to_venue_local(flight.start_at, "Europe/Kaliningrad").hour == 20

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(NotificationQueue.type == NotificationType.TIME_CHANGED)
    )
    assert queued == 1


async def test_publish_with_notifications_disabled_sends_nothing(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    flight = await db_session.scalar(
        select(Flight).join(Event).where(Event.import_key == "4", Flight.label == "Day 1B")
    )
    assert flight is not None
    await login_as(client, get_settings().seed_admin_email)
    await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "flight", "target_id": str(flight.id)},
    )

    rows = default_rows()
    rows[1]["time"] = "20:00"
    report = (await upload_and_publish(editor_client, rows, notify=False))["report"]

    assert report["flights_updated"] == 1
    assert report["notifications_enqueued"] == 0
    assert report["notifications_suppressed"] is True
    assert await db_session.scalar(select(func.count()).select_from(NotificationQueue)) == 0

    await db_session.refresh(flight)
    assert to_venue_local(flight.start_at, "Europe/Kaliningrad").hour == 20


async def test_missing_events_are_untouched_by_default(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    rows = [item for item in default_rows() if item["event_key"] != "4"]
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    assert view["events"]["missing"] == 1
    plan = find_series_plan(view, "test-rpt-kaliningrad")
    assert plan["action"] == "unchanged"
    orphan = next(item for item in plan["events"] if item["import_key"] == "4")
    assert orphan["action"] == "missing"
    assert orphan["diffs"] == []

    await publish(editor_client, job["id"], view["preview_token"])
    event = await db_session.scalar(select(Event).where(Event.import_key == "4"))
    assert event is not None
    assert event.status is EventStatus.SCHEDULED


async def test_missing_events_are_cancelled_when_requested(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    flight = await db_session.scalar(
        select(Flight).join(Event).where(Event.import_key == "4", Flight.label == "Day 1A")
    )
    assert flight is not None
    await login_as(client, get_settings().seed_admin_email)
    await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "flight", "target_id": str(flight.id)},
    )

    rows = [item for item in default_rows() if item["event_key"] != "4"]
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"], mark_missing_cancelled=True)

    plan = find_series_plan(view, "test-rpt-kaliningrad")
    orphan = next(item for item in plan["events"] if item["import_key"] == "4")
    assert orphan["diffs"] == [
        {"field": "status", "label": "статус", "old_value": "scheduled", "new_value": "cancelled"}
    ]
    assert view["total_recipients"] == 1

    report = (
        await publish(
            editor_client,
            job["id"],
            view["preview_token"],
            mark_missing_cancelled=True,
        )
    )["report"]
    assert report["events_cancelled"] == 1

    event = await db_session.scalar(select(Event).where(Event.import_key == "4"))
    assert event is not None
    assert event.status is EventStatus.CANCELLED

    entry = await db_session.scalar(
        select(ChangeLog).where(
            ChangeLog.entity_id == event.id,
            ChangeLog.change_type == ChangeType.CANCELLED,
        )
    )
    assert entry is not None
    assert entry.new_value is not None
    assert entry.new_value["status"] == "cancelled"

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(NotificationQueue.type == NotificationType.EVENT_CANCELLED)
    )
    assert queued == 1


async def test_preview_token_is_bound_to_missing_flag(
    editor_client: AsyncClient,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    rows = [item for item in default_rows() if item["event_key"] != "4"]
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"], mark_missing_cancelled=False)

    response = await editor_client.post(
        f"{BULK}/{job['id']}/publish",
        params={"mark_missing_cancelled": True},
        headers={"X-Preview-Token": view["preview_token"]},
    )
    assert response.status_code == 409, response.text


async def test_publish_requires_preview_token(editor_client: AsyncClient) -> None:
    job = await upload(editor_client, default_rows())
    response = await editor_client.post(f"{BULK}/{job['id']}/publish")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "preview_required"


async def test_errors_point_at_row_and_column(editor_client: AsyncClient) -> None:
    rows = default_rows()
    rows[0]["timezone"] = "Europe/Kaliningrado"
    rows[1]["timezone"] = "Europe/Kaliningrado"
    rows[2]["timezone"] = "Europe/Kaliningrado"
    rows[3]["timezone"] = "Europe/Kaliningrado"
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    assert view["can_publish"] is False
    issue = next(item for item in view["issues"] if item["code"] == "unknown_timezone")
    assert issue["row"] == 2
    assert issue["column"] == "G"
    assert "Europe/Kaliningrado" in issue["message"]

    response = await editor_client.post(
        f"{BULK}/{job['id']}/publish",
        headers={"X-Preview-Token": view["preview_token"]},
    )
    assert response.status_code == 400


async def test_date_outside_series_range_is_reported(editor_client: AsyncClient) -> None:
    rows = default_rows()
    rows[3]["date"] = "20.08.2026"
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    issue = next(item for item in view["issues"] if item["code"] == "date_outside_series")
    assert issue["row"] == 5
    assert issue["column"] == "R"
    assert view["can_publish"] is False


async def test_unknown_currency_is_rejected(editor_client: AsyncClient) -> None:
    rows = default_rows()
    for row in rows:
        if row["series_key"] == "test-bpt-minsk":
            row["currency"] = "KZT"
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    issue = next(item for item in view["issues"] if item["code"] == "unknown_currency")
    assert issue["column"] == "J"
    assert "KZT" in issue["message"]
    assert view["can_publish"] is False


async def test_demo_rows_never_reach_the_database(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await upload(editor_client, template_bytes())
    view = await preview(editor_client, job["id"])

    assert view["plans"] == []
    assert view["series"]["created"] == 0
    assert job["draft"]["demo_rows_skipped"] == [2, 3, 4, 5, 6]

    await publish(editor_client, job["id"], view["preview_token"])
    assert await db_session.scalar(select(func.count()).select_from(Series)) == 0


async def test_new_references_are_listed_before_creation(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await upload(editor_client, default_rows())
    view = await preview(editor_client, job["id"])

    assert view["new_references"]["organizers"] == ["Test BPT", "Test RPT"]
    assert [item["name"] for item in view["new_references"]["venues"]] == [
        "Test Casino Opera",
        "Test Sobranie Poker Club",
    ]
    assert await db_session.scalar(select(Organizer).where(Organizer.name == "Test RPT")) is None

    await publish(editor_client, job["id"], view["preview_token"])
    venue = await db_session.scalar(select(Venue).where(Venue.name == "Test Casino Opera"))
    assert venue is not None
    assert venue.timezone == "Europe/Minsk"
    assert venue.country_code == "BY"


async def test_existing_references_match_by_name_ignoring_case(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())
    before = await db_session.scalar(select(func.count()).select_from(Organizer))

    rows = default_rows()
    for row in rows:
        if row["series_key"] == "test-rpt-kaliningrad":
            row["organizer"] = "  test rpt  "
            row["venue"] = "TEST SOBRANIE POKER CLUB"
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    assert view["new_references"]["organizers"] == []
    assert view["new_references"]["venues"] == []
    assert find_series_plan(view, "test-rpt-kaliningrad")["action"] == "unchanged"

    await publish(editor_client, job["id"], view["preview_token"])
    assert await db_session.scalar(select(func.count()).select_from(Organizer)) == before


async def test_failed_publish_leaves_nothing_behind(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Ошибка в середине не должна оставить половину загруженной."""
    job = await upload(editor_client, default_rows())
    view = await preview(editor_client, job["id"])
    organizers_before = await db_session.scalar(select(func.count()).select_from(Organizer))

    # Пока админ смотрел предпросмотр, кто-то завёл серию с тем же ключом:
    # план перестал сходиться, публикация обязана упасть целиком.
    db_session.add(
        Series(
            organizer_id=await db_session.scalar(select(Organizer.id)),
            venue_id=await db_session.scalar(select(Venue.id)),
            name="Squatter",
            slug="squatter-series",
            import_key="test-bpt-minsk",
            starts_on=date(2027, 1, 9),
            ends_on=date(2027, 1, 19),
            status=SeriesStatus.ANNOUNCED,
        )
    )
    await db_session.flush()

    response = await editor_client.post(
        f"{BULK}/{job['id']}/publish",
        headers={"X-Preview-Token": view["preview_token"]},
    )
    assert response.status_code == 409, response.text
    assert await db_session.scalar(select(func.count()).select_from(Event)) == 0
    assert (
        await db_session.scalar(select(func.count()).select_from(Organizer)) == organizers_before
    )


async def test_frozen_series_status_is_kept_with_warning(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())
    series = await db_session.scalar(
        select(Series).where(Series.import_key == "test-rpt-kaliningrad")
    )
    assert series is not None
    series.status = SeriesStatus.FINISHED
    await db_session.flush()

    rows = default_rows()
    rows[0]["time"] = "13:00"
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    plan = find_series_plan(view, "test-rpt-kaliningrad")
    assert plan["action"] == "update"
    assert any(item["code"] == "series_frozen_status" for item in plan["warnings"])
    assert all(item["field"] != "status" for item in plan["diffs"])

    await publish(editor_client, job["id"], view["preview_token"])
    await db_session.refresh(series)
    assert series.status is SeriesStatus.FINISHED


async def test_bulk_jobs_are_hidden_from_the_regular_import_list(
    editor_client: AsyncClient,
) -> None:
    await upload(editor_client, default_rows())

    regular = await editor_client.get(f"{ADMIN}/import")
    assert regular.status_code == 200
    assert regular.json()["items"] == []

    bulk = await editor_client.get(BULK)
    assert bulk.status_code == 200
    assert bulk.json()["total"] == 1


async def test_non_xlsx_upload_is_rejected(editor_client: AsyncClient) -> None:
    response = await editor_client.post(
        BULK,
        files={"file": ("schedule.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert response.status_code == 400, response.text


async def test_report_is_stored_on_the_job(
    editor_client: AsyncClient,
) -> None:
    job = await upload(editor_client, default_rows())
    view = await preview(editor_client, job["id"])
    await publish(editor_client, job["id"], view["preview_token"])

    response = await editor_client.get(f"{BULK}/{job['id']}")
    assert response.status_code == 200
    stored = response.json()
    assert stored["status"] == "published"
    assert stored["draft"]["report"]["series_created"] == 2
    assert stored["published_at"] is not None
    published_at = datetime.fromisoformat(stored["published_at"])
    assert published_at <= datetime.now(UTC)


async def test_guarantee_change_notifies_event_subscribers(
    editor_client: AsyncClient,
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    flight = await db_session.scalar(
        select(Flight).join(Event).where(Event.import_key == "5", Flight.label == "Day 1A")
    )
    assert flight is not None
    await login_as(client, get_settings().seed_admin_email)
    await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "flight", "target_id": str(flight.id)},
    )

    rows = default_rows()
    for row in rows:
        if row["event_key"] == "5":
            row["guarantee"] = 10000000
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    plan = find_series_plan(view, "test-rpt-kaliningrad")
    event_plan = next(item for item in plan["events"] if item["import_key"] == "5")
    assert {item["field"] for item in event_plan["diffs"]} == {"guarantee"}
    assert event_plan["recipients"] == 1

    await publish(editor_client, job["id"], view["preview_token"])
    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(NotificationQueue.type == NotificationType.GUARANTEE_CHANGED)
    )
    assert queued == 1


async def test_empty_optional_cell_does_not_erase_stored_value(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await upload_and_publish(editor_client, default_rows())

    rows = default_rows()
    for row in rows:
        if row["event_key"] == "4":
            row["itm_note"] = None
    job = await upload(editor_client, rows)
    view = await preview(editor_client, job["id"])

    assert find_series_plan(view, "test-rpt-kaliningrad")["action"] == "unchanged"
    event = await db_session.scalar(select(Event).where(Event.import_key == "4"))
    assert event is not None
    assert event.day_end_note == "till 12%"


async def test_series_created_manually_does_not_collide(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Записи без import_key не должны считаться «исчезнувшими» из файла."""
    await upload_and_publish(editor_client, default_rows())
    series = await db_session.scalar(
        select(Series).where(Series.import_key == "test-rpt-kaliningrad")
    )
    assert series is not None

    manual = await editor_client.post(
        f"{ADMIN}/series/{series.id}/events",
        json={
            "name": "Added by hand",
            "buyin": "5000",
            "currency_code": "RUB",
            "flights": [{"label": None, "play_date": "2026-08-05", "play_time": "19:00"}],
        },
    )
    assert manual.status_code == 201, manual.text
    manual_id = UUID(manual.json()["id"])

    job = await upload(editor_client, default_rows())
    view = await preview(editor_client, job["id"], mark_missing_cancelled=True)
    assert view["events"]["missing"] == 0

    await publish(editor_client, job["id"], view["preview_token"], mark_missing_cancelled=True)
    kept = await db_session.get(Event, manual_id)
    assert kept is not None
    assert kept.status is EventStatus.SCHEDULED
