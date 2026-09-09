"""Integration: slug resolve, UUID 301 redirects, collision suffixes."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SeriesStatus
from app.services import slugs as slugs_service
from tests.factories import EventFactory, OrganizerFactory, SeriesFactory, VenueFactory, persist


@pytest.mark.integration
async def test_allocate_series_slug_collision(db_session: AsyncSession) -> None:
    organizer = await persist(db_session, OrganizerFactory(slug="rpt"))
    venue = await persist(db_session, VenueFactory(city="Сочи"))
    first = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            starts_on=date(2026, 8, 1),
            ends_on=date(2026, 8, 10),
            slug="rpt-sochi-2026-08",
            status=SeriesStatus.ANNOUNCED,
        ),
    )
    second_slug = await slugs_service.allocate_series_slug(
        db_session,
        organizer_slug=organizer.slug,
        city=venue.city,
        starts_on=date(2026, 8, 15),
    )
    assert first.slug == "rpt-sochi-2026-08"
    assert second_slug == "rpt-sochi-2026-08-2"


@pytest.mark.integration
async def test_api_get_series_by_slug_and_uuid(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series = await persist(
        db_session,
        SeriesFactory(slug="rpt-kaliningrad-2026-08", status=SeriesStatus.SCHEDULE_PUBLISHED),
    )
    await db_session.flush()

    by_slug = await client.get(f"/api/v1/series/{series.slug}")
    by_uuid = await client.get(f"/api/v1/series/{series.id}")
    assert by_slug.status_code == 200
    assert by_uuid.status_code == 200
    assert by_slug.json()["slug"] == series.slug
    assert by_uuid.json()["id"] == str(series.id)


@pytest.mark.integration
async def test_spa_uuid_redirects_to_slug(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series = await persist(
        db_session,
        SeriesFactory(slug="rpt-minsk-2026-09", status=SeriesStatus.SCHEDULE_PUBLISHED),
    )
    event = await persist(
        db_session,
        EventFactory(series=series, slug="5-main-event", number=5, name="Main Event"),
    )
    await slugs_service.record_redirect(
        db_session,
        entity_type="series",
        entity_id=series.id,
        old_slug="legacy-rpt-minsk",
    )
    await db_session.flush()

    series_resp = await client.get(
        f"/series/{series.id}?day=2026-09-01",
        follow_redirects=False,
    )
    event_resp = await client.get(f"/events/{event.id}", follow_redirects=False)
    redirected = await client.get(
        "/series/legacy-rpt-minsk?day=2026-09-02",
        follow_redirects=False,
    )
    canonical = await client.get(f"/series/{series.slug}", follow_redirects=False)

    assert series_resp.status_code == 301
    assert series_resp.headers["location"] == f"/series/{series.slug}?day=2026-09-01"
    assert event_resp.status_code == 301
    assert event_resp.headers["location"] == f"/events/{series.slug}-{event.slug}"
    assert redirected.status_code == 301
    assert redirected.headers["location"] == f"/series/{series.slug}?day=2026-09-02"
    assert canonical.status_code == 200


@pytest.mark.integration
async def test_rename_does_not_change_slug(
    db_session: AsyncSession,
    editor_client: AsyncClient,
) -> None:
    series = await persist(
        db_session,
        SeriesFactory(slug="rpt-sochi-2026-07", status=SeriesStatus.ANNOUNCED, name="Old Name"),
    )
    await db_session.flush()

    resp = await editor_client.patch(
        f"/api/v1/admin/series/{series.id}",
        json={"name": "New Fancy Name"},
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == "rpt-sochi-2026-07"
    assert resp.json()["name"] == "New Fancy Name"


@pytest.mark.integration
async def test_manual_slug_change_creates_redirect(
    db_session: AsyncSession,
    editor_client: AsyncClient,
) -> None:
    series = await persist(
        db_session,
        SeriesFactory(slug="rpt-sochi-2026-07", status=SeriesStatus.ANNOUNCED),
    )
    await db_session.flush()

    resp = await editor_client.patch(
        f"/api/v1/admin/series/{series.id}",
        json={"slug": "custom-sochi-summer"},
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == "custom-sochi-summer"

    redirected = await editor_client.get("/series/rpt-sochi-2026-07", follow_redirects=False)
    assert redirected.status_code == 301
    assert redirected.headers["location"] == "/series/custom-sochi-summer"


@pytest.mark.integration
async def test_event_api_by_compound_key(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    series = await persist(db_session, SeriesFactory(slug="eapt-cyprus-2026-05"))
    event = await persist(
        db_session,
        EventFactory(series=series, slug="1-opening", number=1, name="Opening"),
    )
    await db_session.flush()

    resp = await client.get(f"/api/v1/events/{series.slug}-{event.slug}")
    by_uuid = await client.get(f"/api/v1/events/{event.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(event.id)
    assert by_uuid.json()["slug"] == "1-opening"
