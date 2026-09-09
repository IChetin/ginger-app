from __future__ import annotations

from datetime import date, time
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ChangeType, ImportStatus, ParsePath, SeriesStatus
from app.models.imports import ImportJob
from app.models.schedule import ChangeLog, Event, Series
from app.schemas.imports import DraftEvent, DraftFlight, ParseResult
from app.services.imports.ai import get_mock_ai_provider
from tests.conftest import seed_organizer_id, seed_venue_id

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"


def _csv_bytes() -> bytes:
    return b"number,name,buyin\n1,Imported Main,5500\n"


def _mock_parse_result() -> ParseResult:
    return ParseResult(
        events=[
            DraftEvent(
                number=1,
                name="Imported Main",
                buyin=Decimal("5500.00"),
                currency_code="RUB",
                flights=[
                    DraftFlight(
                        label=None,
                        play_date=date(2026, 8, 2),
                        play_time=time(14, 0),
                    )
                ],
            )
        ],
        unparsed_rows=[],
        confidence=Decimal("0.91"),
        parser_used="mock",
        parse_path=ParsePath.AI,
        tokens_input=10,
        tokens_output=20,
        estimated_cost_usd=Decimal("0"),
    )


async def _create_empty_series(client: AsyncClient) -> str:
    response = await client.post(
        f"{ADMIN}/series",
        json={
            "organizer_id": str(seed_organizer_id()),
            "venue_id": str(seed_venue_id()),
            "name": "Import Target",
            "starts_on": "2026-08-01",
            "ends_on": "2026-08-07",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture(autouse=True)
def _reset_mock_ai() -> None:
    provider = get_mock_ai_provider()
    provider.set_result(None)
    yield
    provider.set_result(None)


async def test_import_requires_auth(client: AsyncClient) -> None:
    response = await client.get(f"{ADMIN}/import")
    assert response.status_code == 401


async def test_import_upload_mock_ai_review_edit_and_publish(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series_id = await _create_empty_series(editor_client)
    get_mock_ai_provider().set_result(_mock_parse_result())

    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["status"] == ImportStatus.REVIEW.value
    assert body["parse_path"] == ParsePath.AI.value
    assert body["draft"]["events"][0]["name"] == "Imported Main"
    assert body["draft"]["events"][0]["parse_path"] == ParsePath.AI.value
    assert body["draft"]["events"][0]["source_fragment"]
    assert "buyin" in body["draft"]["events"][0]["field_confidence"]
    assert "file_data" not in body
    job_id = body["id"]

    # file blob stays in DB only
    job = await db_session.get(ImportJob, job_id)
    assert job is not None
    assert job.file_data == _csv_bytes()

    patched = await editor_client.put(
        f"{ADMIN}/import/{job_id}/draft",
        json={
            "draft": {
                "kind": "schedule",
                "events": [
                    {
                        "number": 1,
                        "name": "Imported Main Fixed",
                        "buyin": "5500.00",
                        "currency_code": "RUB",
                        "flights": [
                            {
                                "label": None,
                                "play_date": "2026-08-02",
                                "play_time": "15:00:00",
                            }
                        ],
                    }
                ],
                "unparsed_rows": [],
                "confidence": "0.91",
                "issues": [],
            }
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["draft"]["events"][0]["name"] == "Imported Main Fixed"
    assert patched.json()["fields_corrected"] is not None

    preview = await editor_client.post(f"{ADMIN}/import/{job_id}/publish/preview")
    assert preview.status_code == 200, preview.text
    token = preview.json()["preview_token"]
    assert preview.json()["requires_confirmation"] is True
    assert preview.json()["events_to_create"] == 1

    published = await editor_client.post(
        f"{ADMIN}/import/{job_id}/publish",
        headers={"X-Preview-Token": token},
    )
    assert published.status_code == 200, published.text
    assert published.json()["events_created"] == 1

    series = await db_session.get(Series, series_id)
    assert series is not None
    assert series.status == SeriesStatus.SCHEDULE_PUBLISHED
    events = list(await db_session.scalars(select(Event).where(Event.series_id == series_id)))
    assert len(events) == 1
    assert events[0].name == "Imported Main Fixed"

    change = await db_session.scalar(
        select(ChangeLog).where(
            ChangeLog.entity_type == "series",
            ChangeLog.entity_id == series_id,
            ChangeLog.change_type == ChangeType.SCHEDULE_PUBLISHED,
        )
    )
    assert change is not None

    job = await db_session.get(ImportJob, job_id)
    assert job is not None
    assert job.status == ImportStatus.PUBLISHED
    assert job.published_at is not None


async def test_import_cancel_review_job(
    editor_client: AsyncClient,
) -> None:
    series_id = await _create_empty_series(editor_client)
    get_mock_ai_provider().set_result(_mock_parse_result())
    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert upload.status_code == 201, upload.text
    job_id = upload.json()["id"]
    assert upload.json()["status"] == ImportStatus.REVIEW.value

    cancelled = await editor_client.post(f"{ADMIN}/import/{job_id}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == ImportStatus.FAILED.value
    assert cancelled.json()["error"] == "cancelled_by_editor"

    again = await editor_client.post(f"{ADMIN}/import/{job_id}/cancel")
    assert again.status_code == 409


async def test_import_rejects_non_empty_series_and_ai_unavailable(
    editor_client: AsyncClient,
) -> None:
    series_id = await _create_empty_series(editor_client)
    event = await editor_client.post(
        f"{ADMIN}/series/{series_id}/events",
        json={
            "number": 1,
            "name": "Existing",
            "buyin": "1000",
            "currency_code": "RUB",
        },
    )
    assert event.status_code == 201

    blocked = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert blocked.status_code == 409

    empty_id = await _create_empty_series(editor_client)
    # no mock result → ai_unavailable → failed
    failed = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": empty_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert failed.status_code == 201
    assert failed.json()["status"] == ImportStatus.FAILED.value
    assert "AI" in (failed.json()["error"] or "") or "Mock" in (failed.json()["error"] or "")


async def test_import_create_series_file_timezone_and_enrichment(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from app.models.schedule import Flight

    get_mock_ai_provider().set_result(_mock_parse_result())
    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={
            "create_series": "true",
            "organizer_id": str(seed_organizer_id()),
            "venue_id": str(seed_venue_id()),
            "series_name": "Created From Import",
            "starts_on": "2026-08-01",
            "ends_on": "2026-08-07",
            "file_timezone": "Europe/Kaliningrad",
        },
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["status"] == ImportStatus.REVIEW.value
    assert body["file_timezone"] == "Europe/Kaliningrad"
    assert body["series_id"] is not None
    event = body["draft"]["events"][0]
    assert event["parse_path"] == ParsePath.AI.value
    assert event["source_fragment"]
    assert "buyin" in event["field_confidence"]
    assert Decimal(event["field_confidence"]["buyin"]) <= Decimal("1")

    series = await db_session.get(Series, body["series_id"])
    assert series is not None
    assert series.name == "Created From Import"
    assert series.status == SeriesStatus.ANNOUNCED

    job_id = body["id"]
    preview = await editor_client.post(f"{ADMIN}/import/{job_id}/publish/preview")
    token = preview.json()["preview_token"]
    published = await editor_client.post(
        f"{ADMIN}/import/{job_id}/publish",
        headers={"X-Preview-Token": token},
    )
    assert published.status_code == 200, published.text

    events = list(await db_session.scalars(select(Event).where(Event.series_id == series.id)))
    assert len(events) == 1
    flight = await db_session.scalar(select(Flight).where(Flight.event_id == events[0].id))
    assert flight is not None
    # 14:00 Europe/Kaliningrad (UTC+2) → 12:00 UTC
    assert flight.start_at.hour == 12
    assert flight.start_at.minute == 0


async def test_import_rejects_invalid_file_timezone(editor_client: AsyncClient) -> None:
    series_id = await _create_empty_series(editor_client)
    get_mock_ai_provider().set_result(_mock_parse_result())
    response = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id, "file_timezone": "Not/AZone"},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert response.status_code == 400


async def test_import_stats_and_stale_preview(
    editor_client: AsyncClient,
) -> None:
    series_id = await _create_empty_series(editor_client)
    get_mock_ai_provider().set_result(_mock_parse_result())
    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    job_id = upload.json()["id"]
    preview = await editor_client.post(f"{ADMIN}/import/{job_id}/publish/preview")
    token = preview.json()["preview_token"]

    await editor_client.put(
        f"{ADMIN}/import/{job_id}/draft",
        json={
            "draft": {
                "kind": "schedule",
                "events": [
                    {
                        "number": 1,
                        "name": "Changed After Preview",
                        "buyin": "5500.00",
                        "currency_code": "RUB",
                        "flights": [
                            {
                                "play_date": "2026-08-02",
                                "play_time": "14:00:00",
                            }
                        ],
                    }
                ],
                "unparsed_rows": [],
                "confidence": "0.91",
                "issues": [],
            }
        },
    )
    stale = await editor_client.post(
        f"{ADMIN}/import/{job_id}/publish",
        headers={"X-Preview-Token": token},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "preview_stale"

    stats = await editor_client.get(f"{ADMIN}/import/stats")
    assert stats.status_code == 200
    assert stats.json()["total"] >= 1


async def test_corrupt_xlsx_fails_without_raising(
    editor_client: AsyncClient,
) -> None:
    from pathlib import Path

    series_id = await _create_empty_series(editor_client)
    corrupt = (Path(__file__).parent / "fixtures" / "corrupt.xlsx").read_bytes()
    # No mock AI → parser fails on corrupt zip → AI unavailable → FAILED job.
    response = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={
            "file": (
                "corrupt.xlsx",
                corrupt,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == ImportStatus.FAILED.value
    assert body["error"]


async def test_draft_validation_catches_date_buyin_currency(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import time
    from decimal import Decimal

    from app.models.schedule import Series
    from app.schemas.imports import DraftEvent, DraftFlight, ScheduleImportDraft
    from app.services.imports.validation import draft_has_errors, validate_draft

    series_id = await _create_empty_series(editor_client)
    get_mock_ai_provider().set_result(_mock_parse_result())
    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    assert upload.status_code == 201, upload.text
    job_id = upload.json()["id"]

    # API-level: date outside series, unknown currency, duplicate numbers.
    patched = await editor_client.put(
        f"{ADMIN}/import/{job_id}/draft",
        json={
            "draft": {
                "kind": "schedule",
                "events": [
                    {
                        "number": 1,
                        "name": "Outside",
                        "buyin": "1000.00",
                        "currency_code": "XYZ",
                        "flights": [
                            {
                                "play_date": "2020-01-01",
                                "play_time": "12:00:00",
                            }
                        ],
                    },
                    {
                        "number": 1,
                        "name": "Dup Number",
                        "buyin": "1000.00",
                        "currency_code": "RUB",
                        "flights": [
                            {
                                "play_date": "2026-08-02",
                                "play_time": "12:00:00",
                            }
                        ],
                    },
                ],
                "unparsed_rows": [],
                "confidence": "0.5",
                "issues": [],
            }
        },
    )
    assert patched.status_code == 200, patched.text
    draft = patched.json()["draft"]
    codes = {issue["code"] for issue in draft["issues"] if issue.get("code")}
    assert "currency" in codes
    assert "date_range" in codes
    assert "duplicate_number" in codes

    # buyin_negative is enforced in validate_draft (parsers); schema Field(ge=0) blocks API.
    series = await db_session.get(Series, series_id)
    assert series is not None
    negative_event = DraftEvent.model_construct(
        number=1,
        name="Negative",
        buyin=Decimal("-100.00"),
        currency_code="RUB",
        flights=[DraftFlight(play_date=date(2026, 8, 2), play_time=time(12, 0))],
        tags=[],
        issues=[],
        field_confidence={},
        reentry_unlimited=False,
    )
    validated = await validate_draft(
        db_session,
        ScheduleImportDraft(
            kind="schedule",
            events=[negative_event],
            unparsed_rows=[],
            confidence=Decimal("0.5"),
            issues=[],
        ),
        series=series,
    )
    assert draft_has_errors(validated)
    assert any(issue.code == "buyin_negative" for issue in validated.issues)


async def test_publish_blocked_when_required_fields_missing(
    editor_client: AsyncClient,
) -> None:
    series_id = await _create_empty_series(editor_client)
    get_mock_ai_provider().set_result(_mock_parse_result())
    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id},
        files={"file": ("schedule.csv", _csv_bytes(), "text/csv")},
    )
    job_id = upload.json()["id"]

    patched = await editor_client.put(
        f"{ADMIN}/import/{job_id}/draft",
        json={
            "draft": {
                "kind": "schedule",
                "events": [
                    {
                        "number": 1,
                        "name": "Bad Currency Event",
                        "buyin": "1000.00",
                        "currency_code": "ZZZ",
                        "flights": [
                            {
                                "play_date": "2026-08-02",
                                "play_time": "12:00:00",
                            }
                        ],
                    }
                ],
                "unparsed_rows": [],
                "confidence": "0.9",
                "issues": [],
            }
        },
    )
    assert patched.status_code == 200, patched.text
    assert any(issue.get("code") == "currency" for issue in patched.json()["draft"]["issues"])

    preview = await editor_client.post(f"{ADMIN}/import/{job_id}/publish/preview")
    assert preview.status_code == 400, preview.text
    assert preview.json()["error"]["code"] == "validation_error"

    publish = await editor_client.post(f"{ADMIN}/import/{job_id}/publish")
    assert publish.status_code in {400, 409}


async def test_production_ai_provider_is_unconfigured() -> None:
    from app.core.config import Settings
    from app.services.imports.ai import UnconfiguredAiProvider, get_ai_provider

    prod = Settings(app_env="production", import_ai_provider="mock")
    provider = get_ai_provider(prod)
    assert isinstance(provider, UnconfiguredAiProvider)
