"""Admin parser profiles API + organizer binding."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.references import Organizer
from app.services.imports.ai import get_mock_ai_provider
from tests.conftest import seed_organizer_id, seed_venue_id

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
SAMPLES = Path(__file__).resolve().parents[2] / "docs" / "rasp_samples"


async def test_list_parser_profiles_have_title_and_id(
    editor_client: AsyncClient,
) -> None:
    response = await editor_client.get(f"{ADMIN}/parsers")
    assert response.status_code == 200
    body = response.json()
    assert body
    apc = next(item for item in body if item["name"] == "apc_xlsx_v1")
    assert apc["id"]
    assert apc["title"]
    assert apc["kind"] == "schedule"
    assert apc["is_active"] is True
    assert apc["is_available"] is True
    assert "apc" in apc["organizer_slugs"]


async def test_update_parser_title_admin_only(
    admin_client: AsyncClient,
) -> None:
    listed = await admin_client.get(f"{ADMIN}/parsers")
    apc = next(item for item in listed.json() if item["name"] == "apc_xlsx_v1")

    updated = await admin_client.patch(
        f"{ADMIN}/parsers/{apc['id']}",
        json={"title": "APC Excel", "notes": "тест"},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["title"] == "APC Excel"
    assert body["notes"] == "тест"
    assert body["name"] == "apc_xlsx_v1"


async def test_update_parser_editor_forbidden(
    editor_client: AsyncClient,
) -> None:
    listed = await editor_client.get(f"{ADMIN}/parsers")
    apc = next(item for item in listed.json() if item["name"] == "apc_xlsx_v1")
    forbidden = await editor_client.patch(
        f"{ADMIN}/parsers/{apc['id']}",
        json={"title": "Hack"},
    )
    assert forbidden.status_code == 403


async def test_organizer_parser_binding_roundtrip(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    parsers = (await admin_client.get(f"{ADMIN}/parsers")).json()
    apc = next(item for item in parsers if item["name"] == "apc_xlsx_v1")
    rpt_struct = next(item for item in parsers if item["name"] == "rpt_structure_pdf_v1")

    # APC seed organizer (index 2)
    org_id = str(seed_organizer_id(2))
    response = await admin_client.patch(
        f"{ADMIN}/organizers/{org_id}",
        json={
            "schedule_parser_id": apc["id"],
            "structure_parser_id": None,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["schedule_parser_id"] == apc["id"]
    assert body["schedule_parser_code"] == "apc_xlsx_v1"
    assert body["schedule_parser_title"]
    assert body["structure_parser_id"] is None

    # Wrong kind rejected
    bad = await admin_client.patch(
        f"{ADMIN}/organizers/{org_id}",
        json={"schedule_parser_id": rpt_struct["id"]},
    )
    assert bad.status_code == 400

    organizer = await db_session.scalar(
        select(Organizer)
        .where(Organizer.id == seed_organizer_id(2))
        .options(selectinload(Organizer.schedule_parser))
    )
    assert organizer is not None
    assert organizer.schedule_parser is not None
    assert organizer.schedule_parser.code == "apc_xlsx_v1"


async def test_seed_bindings_applied(
    seeded_db: None,
    db_session: AsyncSession,
) -> None:
    """Migration/seed backfill: APC→apc_xlsx_v1, RPT→rpt_structure_pdf_v1."""
    apc = await db_session.scalar(
        select(Organizer)
        .where(Organizer.slug == "apc")
        .options(selectinload(Organizer.schedule_parser))
    )
    rpt = await db_session.scalar(
        select(Organizer)
        .where(Organizer.slug == "rpt")
        .options(selectinload(Organizer.structure_parser))
    )
    assert apc is not None and apc.schedule_parser is not None
    assert apc.schedule_parser.code == "apc_xlsx_v1"
    assert rpt is not None and rpt.structure_parser is not None
    assert rpt.structure_parser.code == "rpt_structure_pdf_v1"


async def test_bound_parser_used_on_import_auto(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Organizer binding drives auto selection when parser_requested is omitted."""
    sample = SAMPLES / "расписание APC-43.xlsx"
    if not sample.exists():
        pytest.skip("APC sample missing")

    parsers = (await admin_client.get(f"{ADMIN}/parsers")).json()
    apc_parser = next(item for item in parsers if item["name"] == "apc_xlsx_v1")

    # Bind APC parser to EAPT organizer (no legacy slug match).
    eapt_id = str(seed_organizer_id(1))
    bind = await admin_client.patch(
        f"{ADMIN}/organizers/{eapt_id}",
        json={"schedule_parser_id": apc_parser["id"]},
    )
    assert bind.status_code == 200, bind.text

    series = await admin_client.post(
        f"{ADMIN}/series",
        json={
            "organizer_id": eapt_id,
            "venue_id": str(seed_venue_id()),
            "name": "EAPT with APC parser",
            "starts_on": "2026-07-01",
            "ends_on": "2026-07-14",
        },
    )
    assert series.status_code == 201, series.text
    series_id = series.json()["id"]

    with sample.open("rb") as handle:
        upload = await admin_client.post(
            f"{ADMIN}/import",
            files={
                "file": (
                    sample.name,
                    handle,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"series_id": series_id, "import_kind": "schedule"},
        )
    assert upload.status_code == 201, upload.text
    job = upload.json()
    assert job["parser_used"] == "apc_xlsx_v1"
    assert job["status"] == "review"


async def test_deactivate_parser_blocks_new_binding(
    admin_client: AsyncClient,
) -> None:
    parsers = (await admin_client.get(f"{ADMIN}/parsers")).json()
    bpt = next(item for item in parsers if item["name"] == "bpt_pdf_v1")
    await admin_client.patch(
        f"{ADMIN}/parsers/{bpt['id']}",
        json={"is_active": False},
    )
    response = await admin_client.patch(
        f"{ADMIN}/organizers/{seed_organizer_id(1)}",
        json={"schedule_parser_id": bpt["id"]},
    )
    assert response.status_code == 400
    # Restore for other tests in same DB transaction (rolled back anyway).
    await admin_client.patch(
        f"{ADMIN}/parsers/{bpt['id']}",
        json={"is_active": True},
    )


@pytest.fixture(autouse=True)
def _reset_mock_ai() -> None:
    provider = get_mock_ai_provider()
    provider.set_result(None)
    yield
    provider.set_result(None)
