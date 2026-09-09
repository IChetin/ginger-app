from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SeriesStatus
from tests.factories import (
    CountryFactory,
    CurrencyFactory,
    EventFactory,
    FlightFactory,
    OrganizerFactory,
    SeriesFactory,
    VenueFactory,
    persist,
)

pytestmark = pytest.mark.integration


async def _graph(session: AsyncSession):
    country = await persist(session, CountryFactory(code="RU", name_ru="Россия"))
    currency = await persist(session, CurrencyFactory(code="RUB", symbol="₽"))
    organizer = await persist(session, OrganizerFactory(name="RPT", slug="rpt-search"))
    venue = await persist(
        session,
        VenueFactory(
            country=country,
            city="Калининград",
            name="Sobranie Casino",
            zone="Янтарная",
            timezone="Europe/Kaliningrad",
            slug="sobranie-search",
        ),
    )
    return currency, organizer, venue


async def test_search_requires_min_two_chars(client: AsyncClient) -> None:
    response = await client.get("/api/v1/search", params={"q": "к"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


async def test_search_finds_series_venue_and_event(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    currency, organizer, venue = await _graph(db_session)
    starts = date.today() + timedelta(days=3)
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="RPT Калининград",
            status=SeriesStatus.SCHEDULE_PUBLISHED,
            starts_on=starts,
            ends_on=starts + timedelta(days=5),
        ),
    )
    event = await persist(
        db_session,
        EventFactory(
            series=series,
            name="Kaliningrad Knockout",
            number=4,
            buyin=Decimal("2300.00"),
            currency=currency,
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event,
            start_at=datetime.fromisoformat(f"{starts.isoformat()}T16:00:00+00:00"),
        ),
    )
    # Announced series still searchable; its events are not (no published grid).
    announced = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Калининград Announced Cup",
            status=SeriesStatus.ANNOUNCED,
            starts_on=starts + timedelta(days=40),
            ends_on=starts + timedelta(days=45),
        ),
    )
    await persist(
        db_session,
        EventFactory(
            series=announced,
            name="Kaliningrad Draft Only",
            currency=currency,
        ),
    )

    response = await client.get("/api/v1/search", params={"q": "кали", "limit": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["q"] == "кали"

    series_names = [item["name"] for item in data["series"]["items"]]
    assert "RPT Калининград" in series_names
    assert "Калининград Announced Cup" in series_names

    assert data["venues"]["total"] >= 1
    assert any(item["city"] == "Калининград" for item in data["venues"]["items"])

    events = await client.get("/api/v1/search", params={"q": "Knockout", "limit": 5})
    assert events.status_code == 200
    event_names = [item["name"] for item in events.json()["events"]["items"]]
    assert "Kaliningrad Knockout" in event_names

    draft = await client.get("/api/v1/search", params={"q": "Draft Only", "limit": 5})
    assert draft.status_code == 200
    draft_names = [item["name"] for item in draft.json()["events"]["items"]]
    assert "Kaliningrad Draft Only" not in draft_names
    # Announced series itself still appears when querying its name fragment.
    announced_hit = await client.get("/api/v1/search", params={"q": "Announced", "limit": 5})
    assert any(
        item["id"] == str(announced.id) for item in announced_hit.json()["series"]["items"]
    )

async def test_search_has_more_per_group(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    currency, organizer, venue = await _graph(db_session)
    starts = date.today() + timedelta(days=2)
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Kaliningrad Series Pack",
            status=SeriesStatus.RUNNING,
            starts_on=starts,
            ends_on=starts + timedelta(days=10),
        ),
    )
    for index in range(7):
        event = await persist(
            db_session,
            EventFactory(
                series=series,
                name=f"Kaliningrad Event {index}",
                number=index + 1,
                currency=currency,
            ),
        )
        await persist(
            db_session,
            FlightFactory(
                event=event,
                start_at=datetime.fromisoformat(f"{starts.isoformat()}T12:00:00+00:00")
                + timedelta(hours=index),
            ),
        )

    response = await client.get("/api/v1/search", params={"q": "Kaliningrad Event", "limit": 3})
    assert response.status_code == 200
    events = response.json()["events"]
    assert events["total"] == 7
    assert len(events["items"]) == 3
    assert events["has_more"] is True
