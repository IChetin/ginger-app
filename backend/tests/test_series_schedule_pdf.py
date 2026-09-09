"""Integration tests for series full schedule + PDF export."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import SeriesStatus
from tests.factories import (
    BlindLevelFactory,
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


async def _series_with_events(session: AsyncSession):
    country = await persist(session, CountryFactory(code="RU", name_ru="Россия"))
    currency = await persist(session, CurrencyFactory(code="RUB", symbol="₽"))
    organizer = await persist(session, OrganizerFactory(name="RPT", slug="rpt"))
    venue = await persist(
        session,
        VenueFactory(
            country=country,
            city="Калининград",
            name="Sobranie",
            timezone="Europe/Kaliningrad",
        ),
    )
    starts = date.today() + timedelta(days=5)
    series = await persist(
        session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="RPT Калининград",
            starts_on=starts,
            ends_on=starts + timedelta(days=2),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    event = await persist(
        session,
        EventFactory(
            series=series,
            currency=currency,
            name="Kaliningrad Knockout Championship",
            buyin=Decimal("20000.00"),
            buyin_bounty=Decimal("6000.00"),
            guarantee=Decimal("4000000.00"),
            start_stack=20000,
            late_reg_level=10,
            day_end_note="till 12%",
            tags=["bounty"],
        ),
    )
    await persist(
        session,
        FlightFactory(
            event=event,
            label="Day 1A",
            start_at=datetime(starts.year, starts.month, starts.day, 12, 0, tzinfo=UTC),
        ),
    )
    await persist(
        session,
        BlindLevelFactory(event=event, level_no=1, minutes=30, sb=100, bb=200),
    )
    await persist(
        session,
        BlindLevelFactory(event=event, level_no=2, minutes=30, sb=200, bb=400),
    )
    final = await persist(
        session,
        EventFactory(
            series=series,
            currency=currency,
            name="Championship (Final Day)",
            buyin=Decimal("0"),
            guarantee=None,
            tags=[],
        ),
    )
    await persist(
        session,
        FlightFactory(
            event=final,
            label=None,
            start_at=datetime(starts.year, starts.month, starts.day + 1, 11, 0, tzinfo=UTC),
        ),
    )
    return series, currency


async def test_series_schedule_json(client: AsyncClient, db_session: AsyncSession) -> None:
    series, _currency = await _series_with_events(db_session)
    response = await client.get(f"/api/v1/series/{series.id}/schedule")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "RPT Калининград"
    assert body["timezone_label"].startswith("UTC")
    assert body["events_count"] >= 2
    assert len(body["days"]) >= 1
    row = next(r for day in body["days"] for r in day["rows"] if "Knockout" in r["name"])
    assert row["buyin_display"] == "14\u00a0000+6\u00a0000"
    assert row["level_duration"] == "30 мин"
    assert row["day_end_note"] == "till 12%"
    assert row["highlight"] == "champ"
    closed = next(r for day in body["days"] for r in day["rows"] if "Final Day" in r["name"])
    assert closed["buyin_display"] == "closed"
    assert closed["highlight"] == "closed"


async def test_series_schedule_freeroll_flights(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    series, currency = await _series_with_events(db_session)
    freeroll = await persist(
        db_session,
        EventFactory(
            series=series,
            currency=currency,
            name='Бесплатный турнир "Welcome to Kaliningrad"',
            buyin=Decimal("0"),
            guarantee=Decimal("1000000"),
            tags=[],
        ),
    )
    starts = series.starts_on
    await persist(
        db_session,
        FlightFactory(
            event=freeroll,
            label="Day 1A",
            start_at=datetime(starts.year, starts.month, starts.day, 11, 0, tzinfo=UTC),
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=freeroll,
            label="Day 2",
            start_at=datetime(starts.year, starts.month, starts.day + 1, 11, 0, tzinfo=UTC),
        ),
    )

    response = await client.get(f"/api/v1/series/{series.id}/schedule")
    assert response.status_code == 200
    rows = [
        row
        for day in response.json()["days"]
        for row in day["rows"]
        if "Welcome" in row["name"]
    ]
    day1 = next(row for row in rows if row["flight_label"] == "Day 1A")
    day2 = next(row for row in rows if row["flight_label"] == "Day 2")
    assert day1["highlight"] != "closed"
    assert day1["buyin_display"] == "0"
    assert day2["highlight"] == "closed"
    assert day2["buyin_display"] == "closed"


async def test_series_schedule_pdf_cache(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache_dir = tmp_path / "pdf-cache"
    monkeypatch.setenv("PDF_CACHE_DIR", str(cache_dir))
    get_settings.cache_clear()
    series, _currency = await _series_with_events(db_session)

    first = await client.get(f"/api/v1/series/{series.id}/schedule.pdf")
    assert first.status_code == 200
    assert first.headers["content-type"].startswith("application/pdf")
    assert first.headers["x-pdf-cache"] == "MISS"
    assert first.content[:4] == b"%PDF"
    assert "Day2_rpt" in first.headers.get("content-disposition", "")

    second = await client.get(f"/api/v1/series/{series.id}/schedule.pdf")
    assert second.status_code == 200
    assert second.headers["x-pdf-cache"] == "HIT"
    assert second.content == first.content

    # Invalidate via event update timestamp bump
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.schedule import Event

    event = (
        await db_session.scalars(select(Event).where(Event.series_id == series.id))
    ).first()
    assert event is not None

    event.name = f"{event.name} *"
    event.updated_at = datetime.now(UTC)
    await db_session.commit()

    third = await client.get(f"/api/v1/series/{series.id}/schedule.pdf")
    assert third.status_code == 200
    assert third.headers["x-pdf-cache"] == "MISS"

    get_settings.cache_clear()


async def test_series_schedule_pdf_without_blinds(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PDF_CACHE_DIR", str(tmp_path / "pdf2"))
    get_settings.cache_clear()
    country = await persist(db_session, CountryFactory(code="BY", name_ru="Беларусь"))
    currency = await persist(db_session, CurrencyFactory(code="BYN", symbol="Br"))
    organizer = await persist(db_session, OrganizerFactory(name="APC", slug="apc"))
    venue = await persist(
        db_session,
        VenueFactory(country=country, city="Минск", name="Club", timezone="Europe/Minsk"),
    )
    starts = date.today() + timedelta(days=3)
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="APC Mini",
            starts_on=starts,
            ends_on=starts,
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    event = await persist(
        db_session,
        EventFactory(series=series, currency=currency, name="Turbo", buyin=Decimal("500")),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event,
            start_at=datetime(starts.year, starts.month, starts.day, 18, 0, tzinfo=UTC),
        ),
    )
    response = await client.get(f"/api/v1/series/{series.id}/schedule.pdf")
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"
    get_settings.cache_clear()
