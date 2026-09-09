from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SeriesStatus
from app.models.references import Organizer, Venue
from app.seeds.data import ORGANIZERS, VENUES
from tests.conftest import seed_organizer_id, seed_venue_id
from tests.factories import SeriesFactory, persist

pytestmark = pytest.mark.integration

ADMIN_PREFIX = "/api/v1/admin"


async def test_admin_references_unauthorized(client: AsyncClient, seeded_db: None) -> None:
    response = await client.get(f"{ADMIN_PREFIX}/venues")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_editor_can_read_but_not_write_references(
    editor_client: AsyncClient,
) -> None:
    venues = await editor_client.get(f"{ADMIN_PREFIX}/venues")
    organizers = await editor_client.get(f"{ADMIN_PREFIX}/organizers")
    assert venues.status_code == 200
    assert organizers.status_code == 200

    venue_body = {
        "country_code": "RU",
        "city": "Тест",
        "name": "Editor Venue",
        "timezone": "Europe/Moscow",
    }
    create_venue = await editor_client.post(f"{ADMIN_PREFIX}/venues", json=venue_body)
    assert create_venue.status_code == 403

    org_body = {"name": "Editor Org", "slug": "editor-org", "links": {}}
    create_org = await editor_client.post(f"{ADMIN_PREFIX}/organizers", json=org_body)
    assert create_org.status_code == 403

    venue_id = VENUES[0]["id"]
    patch_venue = await editor_client.patch(
        f"{ADMIN_PREFIX}/venues/{venue_id}",
        json={"city": "Нельзя"},
    )
    assert patch_venue.status_code == 403

    organizer_id = ORGANIZERS[0]["id"]
    patch_org = await editor_client.patch(
        f"{ADMIN_PREFIX}/organizers/{organizer_id}",
        json={"name": "Нельзя"},
    )
    assert patch_org.status_code == 403

    delete_venue = await editor_client.delete(f"{ADMIN_PREFIX}/venues/{venue_id}")
    assert delete_venue.status_code == 403

    delete_org = await editor_client.delete(f"{ADMIN_PREFIX}/organizers/{organizer_id}")
    assert delete_org.status_code == 403


async def test_admin_crud_venue_and_organizer(admin_client: AsyncClient) -> None:
    venue_body = {
        "country_code": "RU",
        "city": "Казань",
        "name": "Admin Test Venue",
        "zone": "Центр",
        "timezone": "Europe/Moscow",
        "address": "ул. Тестовая, 1",
    }
    created_venue = await admin_client.post(f"{ADMIN_PREFIX}/venues", json=venue_body)
    assert created_venue.status_code == 201
    venue = created_venue.json()
    assert venue["country_code"] == "RU"
    assert venue["city"] == "Казань"
    assert venue["name"] == "Admin Test Venue"
    assert venue["slug"]
    assert venue["series_count"] == 0
    venue_id = venue["id"]

    got_venue = await admin_client.get(f"{ADMIN_PREFIX}/venues/{venue_id}")
    assert got_venue.status_code == 200
    assert got_venue.json()["id"] == venue_id

    updated_venue = await admin_client.patch(
        f"{ADMIN_PREFIX}/venues/{venue_id}",
        json={"name": "Admin Test Venue Updated"},
    )
    assert updated_venue.status_code == 200
    assert updated_venue.json()["name"] == "Admin Test Venue Updated"

    slug = f"admin-org-{uuid4().hex[:8]}"
    org_body = {"name": "Admin Test Org", "slug": slug, "links": {"site": "https://example.com"}}
    created_org = await admin_client.post(f"{ADMIN_PREFIX}/organizers", json=org_body)
    assert created_org.status_code == 201
    organizer = created_org.json()
    assert organizer["slug"] == slug
    organizer_id = organizer["id"]

    got_org = await admin_client.get(f"{ADMIN_PREFIX}/organizers/{organizer_id}")
    assert got_org.status_code == 200

    updated_org = await admin_client.patch(
        f"{ADMIN_PREFIX}/organizers/{organizer_id}",
        json={"name": "Admin Test Org Updated"},
    )
    assert updated_org.status_code == 200
    assert updated_org.json()["name"] == "Admin Test Org Updated"

    deleted_org = await admin_client.delete(f"{ADMIN_PREFIX}/organizers/{organizer_id}")
    assert deleted_org.status_code == 204

    deleted_venue = await admin_client.delete(f"{ADMIN_PREFIX}/venues/{venue_id}")
    assert deleted_venue.status_code == 204

    missing_venue = await admin_client.get(f"{ADMIN_PREFIX}/venues/{venue_id}")
    assert missing_venue.status_code == 404


async def test_delete_used_venue_and_organizer_returns_409(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    organizer_id = seed_organizer_id()
    venue_id = seed_venue_id()
    organizer = await db_session.get(Organizer, organizer_id)
    venue = await db_session.get(Venue, venue_id)
    assert organizer is not None
    assert venue is not None
    starts = date.today() + timedelta(days=30)
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            starts_on=starts,
            ends_on=starts + timedelta(days=3),
            status=SeriesStatus.ANNOUNCED,
        ),
    )

    delete_venue = await admin_client.delete(f"{ADMIN_PREFIX}/venues/{venue_id}")
    assert delete_venue.status_code == 409
    assert "привязано" in delete_venue.json()["error"]["message"]
    assert "1" in delete_venue.json()["error"]["message"]

    delete_org = await admin_client.delete(f"{ADMIN_PREFIX}/organizers/{organizer_id}")
    assert delete_org.status_code == 409
    assert "привязано" in delete_org.json()["error"]["message"]


async def test_venue_invalid_country_and_organizer_duplicate_slug(
    admin_client: AsyncClient,
) -> None:
    bad_country = await admin_client.post(
        f"{ADMIN_PREFIX}/venues",
        json={
            "country_code": "XX",
            "city": "Nowhere",
            "name": "Bad Venue",
            "timezone": "Europe/Moscow",
        },
    )
    assert bad_country.status_code == 404

    slug = f"dup-slug-{uuid4().hex[:8]}"
    first = await admin_client.post(
        f"{ADMIN_PREFIX}/organizers",
        json={"name": "First Org", "slug": slug, "links": {}},
    )
    assert first.status_code == 201

    duplicate = await admin_client.post(
        f"{ADMIN_PREFIX}/organizers",
        json={"name": "Second Org", "slug": slug, "links": {}},
    )
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.json()["error"]["message"]

    invalid_slug = await admin_client.post(
        f"{ADMIN_PREFIX}/organizers",
        json={"name": "Bad Slug", "slug": "Bad Slug!", "links": {}},
    )
    assert invalid_slug.status_code == 422


async def test_list_parsers_and_series_count_search(
    admin_client: AsyncClient,
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    parsers = await editor_client.get(f"{ADMIN_PREFIX}/parsers")
    assert parsers.status_code == 200
    body = parsers.json()
    assert any(
        item["name"] == "apc_xlsx_v1"
        and "apc" in item["organizer_slugs"]
        and item.get("title")
        and item.get("id")
        for item in body
    )
    assert any(item["kind"] == "structures" for item in body)

    venue_id = seed_venue_id()
    organizer = await db_session.get(Organizer, seed_organizer_id())
    venue = await db_session.get(Venue, venue_id)
    assert organizer is not None and venue is not None
    starts = date.today() + timedelta(days=40)
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            starts_on=starts,
            ends_on=starts + timedelta(days=2),
            status=SeriesStatus.ANNOUNCED,
        ),
    )

    venues = await admin_client.get(f"{ADMIN_PREFIX}/venues", params={"search": venue.name})
    assert venues.status_code == 200
    match = next(item for item in venues.json()["items"] if item["id"] == str(venue_id))
    assert match["series_count"] >= 1
    assert match["slug"]

    orgs = await admin_client.get(
        f"{ADMIN_PREFIX}/organizers",
        params={"search": organizer.slug},
    )
    assert orgs.status_code == 200
    org_match = next(item for item in orgs.json()["items"] if item["id"] == str(organizer.id))
    assert org_match["series_count"] >= 1


def _png_bytes(width: int = 120, height: int = 120) -> bytes:
    import struct
    import zlib

    def crc(chunk_type: bytes, data: bytes) -> bytes:
        return struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", 13) + b"IHDR" + ihdr + crc(b"IHDR", ihdr)
    iend = struct.pack(">I", 0) + b"IEND" + crc(b"IEND", b"")
    return signature + ihdr_chunk + iend


async def test_organizer_logo_upload_serve_and_delete(
    admin_client: AsyncClient,
) -> None:
    slug = f"logo-org-{uuid4().hex[:8]}"
    created = await admin_client.post(
        f"{ADMIN_PREFIX}/organizers",
        json={"name": "Logo Org", "slug": slug, "links": {}},
    )
    assert created.status_code == 201
    organizer_id = created.json()["id"]
    assert created.json()["logo_url"] is None

    upload = await admin_client.post(
        f"{ADMIN_PREFIX}/organizers/{organizer_id}/logo",
        files={"file": ("logo.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["logo_url"] == f"/api/v1/media/organizers/{organizer_id}/logo"

    served = await admin_client.get(body["logo_url"])
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/png")
    assert served.content.startswith(b"\x89PNG")

    deleted = await admin_client.delete(f"{ADMIN_PREFIX}/organizers/{organizer_id}/logo")
    assert deleted.status_code == 204

    missing = await admin_client.get(body["logo_url"])
    assert missing.status_code == 404

    got = await admin_client.get(f"{ADMIN_PREFIX}/organizers/{organizer_id}")
    assert got.status_code == 200
    assert got.json()["logo_url"] is None
