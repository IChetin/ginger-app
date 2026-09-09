from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ImportKind, ImportStatus
from app.models.schedule import BlindLevel, Event
from tests.conftest import seed_organizer_id, seed_venue_id

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "rasp_samples"
    / "RPT_Altai_03-13_July_2026_Tournament_Structure.pdf"
)


async def _create_rpt_series_with_event(client: AsyncClient) -> tuple[str, str]:
    series = await client.post(
        f"{ADMIN}/series",
        json={
            "organizer_id": str(seed_organizer_id(0)),  # RPT
            "venue_id": str(seed_venue_id(0)),
            "name": "RPT Altai Structures",
            "starts_on": "2026-07-03",
            "ends_on": "2026-07-13",
        },
    )
    assert series.status_code == 201, series.text
    series_id = series.json()["id"]
    event = await client.post(
        f"{ADMIN}/series/{series_id}/events",
        json={
            "number": 1,
            "name": "Altai Championship PKO",
            "buyin": "18000",
            "currency_code": "RUB",
            "start_stack": 10000,
        },
    )
    assert event.status_code == 201, event.text
    # Publish schedule status via admin series update if needed for structure import.
    # Structure import only requires events to exist.
    return series_id, event.json()["id"]


async def test_structure_import_match_and_publish(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series_id, event_id = await _create_rpt_series_with_event(editor_client)
    data = FIXTURE.read_bytes()

    empty_blocked = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id, "import_kind": "schedule"},
        files={"file": ("rpt.pdf", data, "application/pdf")},
    )
    assert empty_blocked.status_code == 409

    upload = await editor_client.post(
        f"{ADMIN}/import",
        data={"series_id": series_id, "import_kind": ImportKind.STRUCTURES.value},
        files={"file": ("rpt.pdf", data, "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["import_kind"] == "structures"
    assert body["status"] == ImportStatus.REVIEW.value
    assert body["parser_used"] == "rpt_structure_pdf_v1"
    assert len(body["draft"]["structures"]) == 22
    first = body["draft"]["structures"][0]
    assert first["source_title"] == "ALTAI CHAMPIONSHIP PKO"
    assert first["matched_event_id"] == event_id
    job_id = body["id"]

    # Keep only the matched championship selected.
    structures = body["draft"]["structures"]
    for index, structure in enumerate(structures):
        structure["selected"] = index == 0
        if index == 0:
            structure["matched_event_id"] = event_id
        else:
            structure["matched_event_id"] = None
            structure["shared_event_ids"] = []
            structure["selected"] = False

    saved = await editor_client.put(
        f"{ADMIN}/import/{job_id}/draft",
        json={"draft": {"kind": "structures", "structures": structures, "issues": []}},
    )
    assert saved.status_code == 200, saved.text

    preview = await editor_client.post(f"{ADMIN}/import/{job_id}/publish/preview")
    assert preview.status_code == 200, preview.text
    assert preview.json()["structures_to_apply"] == 1
    token = preview.json()["preview_token"]

    published = await editor_client.post(
        f"{ADMIN}/import/{job_id}/publish",
        headers={"X-Preview-Token": token},
    )
    assert published.status_code == 200, published.text
    assert published.json()["structures_applied"] == 1

    levels = list(
        await db_session.scalars(select(BlindLevel).where(BlindLevel.event_id == event_id))
    )
    assert len(levels) >= 10
    assert all((level.structure_set_label or "default") == "default" for level in levels)

    event = await db_session.get(Event, event_id)
    assert event is not None
    assert event.start_stack == 20000
    assert event.late_reg_level == 10
