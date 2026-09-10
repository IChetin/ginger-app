from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import event as sa_event
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.enums import GameType, SeriesStatus
from app.models.references import Currency, Organizer, Venue
from app.models.schedule import Event, Series
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import (
    DEMO_SERIES_ID,
    SAMPLE_APC_SERIES_ID,
    SAMPLE_RPT_SERIES_ID,
    seed_demo_schedule,
)
from tests.conftest import login_as
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


async def _base_graph(
    session: AsyncSession,
    *,
    country_code: str = "RU",
    zone: str | None = "Красная Поляна",
    timezone: str = "Europe/Moscow",
    organizer_slug: str = "org-a",
) -> tuple[object, object, object, object]:
    country = await persist(
        session,
        CountryFactory(code=country_code, name_ru=f"Country {country_code}"),
    )
    currency = await persist(session, CurrencyFactory(code="RUB", symbol="₽"))
    organizer = await persist(
        session,
        OrganizerFactory(name="Org", slug=organizer_slug),
    )
    venue = await persist(
        session,
        VenueFactory(
            country=country,
            city="Сочи",
            name="Красная Поляна",
            zone=zone,
            timezone=timezone,
        ),
    )
    return country, currency, organizer, venue


async def test_list_series_pagination_and_stable_sort(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, organizer, venue = await _base_graph(db_session)
    starts = date.today() + timedelta(days=10)
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="B Series",
            starts_on=starts,
            ends_on=starts + timedelta(days=2),
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="A Series",
            starts_on=starts,
            ends_on=starts + timedelta(days=2),
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="C Series",
            starts_on=starts + timedelta(days=1),
            ends_on=starts + timedelta(days=3),
        ),
    )

    first = await client.get("/api/v1/series", params={"limit": 2, "offset": 0})
    second = await client.get("/api/v1/series", params={"limit": 2, "offset": 2})

    assert first.status_code == 200
    assert second.status_code == 200
    body = first.json()
    assert body["total"] == 3
    assert body["limit"] == 2
    assert [item["name"] for item in body["items"]] == ["A Series", "B Series"]
    assert [item["name"] for item in second.json()["items"]] == ["C Series"]


async def test_list_series_filters_and_default_statuses(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    country, currency, organizer, venue = await _base_graph(db_session, organizer_slug="rpt")
    other_country = await persist(db_session, CountryFactory(code="BY", name_ru="Беларусь"))
    other_venue = await persist(
        db_session,
        VenueFactory(
            country=other_country,
            city="Минск",
            name="Минск",
            zone=None,
            timezone="Europe/Minsk",
        ),
    )
    other_org = await persist(db_session, OrganizerFactory(name="EAPT", slug="eapt"))

    today = date.today()
    starts = today - timedelta(days=2)
    ends = today + timedelta(days=5)
    matching = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Match",
            starts_on=starts,
            ends_on=ends,
            status=SeriesStatus.RUNNING,
        ),
    )
    await persist(
        db_session,
        EventFactory(
            series=matching,
            currency=currency,
            buyin=Decimal("15000.00"),
            game_type=GameType.NLH,
            tags=["main", "freezeout"],
        ),
    )

    finished = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Finished",
            starts_on=starts,
            ends_on=ends,
            status=SeriesStatus.FINISHED,
        ),
    )
    await persist(
        db_session,
        EventFactory(
            series=finished,
            currency=currency,
            buyin=Decimal("15000.00"),
            tags=["main"],
        ),
    )

    foreign = await persist(
        db_session,
        SeriesFactory(
            organizer=other_org,
            venue=other_venue,
            name="Foreign",
            starts_on=starts,
            ends_on=ends,
        ),
    )
    await persist(
        db_session,
        EventFactory(
            series=foreign,
            currency=currency,
            buyin=Decimal("5000.00"),
            game_type=GameType.PLO,
            tags=["satellite"],
        ),
    )

    default_feed = await client.get("/api/v1/series")
    assert default_feed.status_code == 200
    names = {item["name"] for item in default_feed.json()["items"]}
    assert "Match" in names
    assert "Foreign" in names
    assert "Finished" not in names

    filtered = await client.get(
        "/api/v1/series",
        params=[
            ("country_code", "RU"),
            ("zone", "Красная Поляна"),
            ("organizer_id", str(organizer.id)),
            ("status", "running"),
            ("starts_from", starts.isoformat()),
            ("starts_to", ends.isoformat()),
            ("buyin_min", "10000"),
            ("buyin_max", "20000"),
            ("game_type", "nlh"),
            ("tags", "main"),
            ("tags", "freezeout"),
        ],
    )
    assert filtered.status_code == 200
    items = filtered.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Match"
    assert items[0]["events_count"] == 1

    finished_only = await client.get("/api/v1/series", params={"status": "finished"})
    assert {item["name"] for item in finished_only.json()["items"]} == {"Finished"}


async def test_running_status_is_date_overlap_not_db_enum(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Home «Идут»: dates cover today, regardless of announced/schedule_published/running."""
    _, _, organizer, venue = await _base_graph(db_session, organizer_slug="running-dates")
    today = date.today()

    announced_live = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Announced Live",
            starts_on=today - timedelta(days=10),
            ends_on=today + timedelta(days=5),
            status=SeriesStatus.ANNOUNCED,
        ),
    )
    published_live = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Published Live",
            starts_on=today - timedelta(days=1),
            ends_on=today + timedelta(days=3),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Future Announced",
            starts_on=today + timedelta(days=20),
            ends_on=today + timedelta(days=30),
            status=SeriesStatus.ANNOUNCED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Future Published",
            starts_on=today + timedelta(days=7),
            ends_on=today + timedelta(days=14),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )

    response = await client.get("/api/v1/series", params={"status": "running"})
    assert response.status_code == 200
    names = {item["name"] for item in response.json()["items"]}
    assert names == {"Announced Live", "Published Live"}
    assert {item["id"] for item in response.json()["items"]} == {
        str(announced_live.id),
        str(published_live.id),
    }


async def test_announced_status_excludes_started_series(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Home «Анонсы»: only announced series that have not started yet."""
    _, _, organizer, venue = await _base_graph(db_session, organizer_slug="announced-future")
    today = date.today()

    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Started Announced",
            starts_on=today - timedelta(days=5),
            ends_on=today + timedelta(days=5),
            status=SeriesStatus.ANNOUNCED,
        ),
    )
    future = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Future Announced",
            starts_on=today + timedelta(days=10),
            ends_on=today + timedelta(days=20),
            status=SeriesStatus.ANNOUNCED,
        ),
    )

    response = await client.get("/api/v1/series", params={"status": "announced"})
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(future.id)
    assert items[0]["name"] == "Future Announced"


async def test_series_list_includes_tab_counts_for_current_filters(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    today = date.today()
    _, _, ru_org, ru_venue = await _base_graph(db_session, organizer_slug="counts-ru")
    by_country = await persist(db_session, CountryFactory(code="BY", name_ru="Беларусь"))
    by_org = await persist(db_session, OrganizerFactory(name="BY Org", slug="counts-by"))
    by_venue = await persist(
        db_session,
        VenueFactory(
            country=by_country,
            city="Минск",
            name="Минск",
            zone=None,
            timezone="Europe/Minsk",
        ),
    )

    await persist(
        db_session,
        SeriesFactory(
            organizer=ru_org,
            venue=ru_venue,
            name="RU Running",
            starts_on=today - timedelta(days=1),
            ends_on=today + timedelta(days=3),
            status=SeriesStatus.RUNNING,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=ru_org,
            venue=ru_venue,
            name="RU Soon",
            starts_on=today + timedelta(days=10),
            ends_on=today + timedelta(days=20),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=ru_org,
            venue=ru_venue,
            name="RU Archive",
            starts_on=today - timedelta(days=40),
            ends_on=today - timedelta(days=30),
            status=SeriesStatus.FINISHED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=by_org,
            venue=by_venue,
            name="BY Running",
            starts_on=today - timedelta(days=2),
            ends_on=today + timedelta(days=2),
            status=SeriesStatus.RUNNING,
        ),
    )

    unfiltered = await client.get("/api/v1/series", params={"status": "actual"})
    assert unfiltered.status_code == 200
    payload = unfiltered.json()
    assert payload["total"] == 3
    assert payload["counts"] == {"all": 3, "running": 2, "archive": 1}

    filtered = await client.get(
        "/api/v1/series",
        params={"status": "running", "countries": "RU"},
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["counts"] == {"all": 2, "running": 1, "archive": 1}


async def test_finished_series_sorted_by_ends_on_desc(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, organizer, venue = await _base_graph(db_session, organizer_slug="archive-sort")
    older = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Older Finished",
            starts_on=date(2026, 1, 1),
            ends_on=date(2026, 1, 10),
            status=SeriesStatus.FINISHED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Newer Finished",
            starts_on=date(2026, 3, 1),
            ends_on=date(2026, 3, 15),
            status=SeriesStatus.FINISHED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Mid Finished",
            starts_on=date(2026, 2, 1),
            ends_on=date(2026, 2, 20),
            status=SeriesStatus.FINISHED,
        ),
    )
    assert older.status == SeriesStatus.FINISHED

    response = await client.get("/api/v1/series", params={"status": "finished"})
    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert names == ["Newer Finished", "Mid Finished", "Older Finished"]


async def test_announced_series_without_events(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, organizer, venue = await _base_graph(db_session, organizer_slug="announced")
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Announced Empty",
            status=SeriesStatus.ANNOUNCED,
        ),
    )

    listing = await client.get("/api/v1/series")
    assert any(item["id"] == str(series.id) for item in listing.json()["items"])

    detail = await client.get(f"/api/v1/series/{series.id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["events_count"] == 0
    assert body["events_by_day"] == []


async def test_series_detail_groups_by_venue_local_date(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, currency, organizer, venue = await _base_graph(
        db_session,
        timezone="Europe/Moscow",
        organizer_slug="tz-org",
    )
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="TZ Series",
            starts_on=date(2026, 9, 1),
            ends_on=date(2026, 9, 5),
        ),
    )
    event = await persist(
        db_session,
        EventFactory(series=series, currency=currency, name="Multi-day ME", number=1),
    )
    # 23:30 UTC = 02:30 MSK next day; 10:00 UTC = 13:00 MSK same UTC day.
    await persist(
        db_session,
        FlightFactory(
            event=event,
            label="A",
            start_at=datetime(2026, 9, 1, 23, 30, tzinfo=UTC),
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event,
            label="B",
            start_at=datetime(2026, 9, 2, 10, 0, tzinfo=UTC),
        ),
    )

    response = await client.get(f"/api/v1/series/{series.id}")
    assert response.status_code == 200
    days = response.json()["events_by_day"]

    # Both flights land on 2026-09-02 Moscow time.
    assert len(days) == 1
    assert days[0]["date"] == "2026-09-02"
    assert len(days[0]["events"]) == 1
    labels = {flight["label"] for flight in days[0]["events"][0]["flights"]}
    assert labels == {"A", "B"}

    # Split across two local days.
    event2 = await persist(
        db_session,
        EventFactory(series=series, currency=currency, name="Split", number=2),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event2,
            label="Day1",
            start_at=datetime(2026, 9, 1, 10, 0, tzinfo=UTC),  # 13:00 MSK Sep 1
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event2,
            label="Day2",
            start_at=datetime(2026, 9, 2, 10, 0, tzinfo=UTC),  # 13:00 MSK Sep 2
        ),
    )

    response = await client.get(f"/api/v1/series/{series.id}")
    days_map = {day["date"]: day["events"] for day in response.json()["events_by_day"]}
    assert "2026-09-01" in days_map
    assert "2026-09-02" in days_map
    day1_split = next(item for item in days_map["2026-09-01"] if item["name"] == "Split")
    day2_split = next(item for item in days_map["2026-09-02"] if item["name"] == "Split")
    # Full flights list is returned on every day so clients can render sibling chips.
    assert [flight["label"] for flight in day1_split["flights"]] == ["Day1", "Day2"]
    assert [flight["label"] for flight in day2_split["flights"]] == ["Day1", "Day2"]


async def test_series_detail_event_summary_includes_stack_and_reentry(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, currency, organizer, venue = await _base_graph(db_session, organizer_slug="stack-org")
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Stack Series",
            starts_on=date(2026, 10, 1),
            ends_on=date(2026, 10, 3),
        ),
    )
    event = await persist(
        db_session,
        EventFactory(
            series=series,
            currency=currency,
            name="Deepstack",
            number=7,
            start_stack=40000,
            reentry_count=2,
            reentry_unlimited=False,
            late_reg_level=8,
            tags=["main"],
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event,
            label="1A",
            start_at=datetime(2026, 10, 1, 16, 0, tzinfo=UTC),
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=event,
            label="1B",
            start_at=datetime(2026, 10, 2, 16, 0, tzinfo=UTC),
        ),
    )

    response = await client.get(f"/api/v1/series/{series.id}")
    assert response.status_code == 200
    day = response.json()["events_by_day"][0]["events"][0]
    assert day["start_stack"] == 40000
    assert day["reentry_count"] == 2
    assert day["reentry_unlimited"] is False
    assert day["late_reg_level"] == 8
    assert [flight["label"] for flight in day["flights"]] == ["1A", "1B"]


async def test_event_detail_utc_and_blind_levels(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    country, currency, organizer, _ = await _base_graph(db_session, organizer_slug="event-org")
    venue = await persist(
        db_session,
        VenueFactory(
            country=country,
            city="Калининград",
            name="Sobranie Casino",
            zone="Янтарная",
            timezone="Europe/Moscow",
            address="Калининградская обл., пос. Куликово",
        ),
    )
    series = await persist(
        db_session,
        SeriesFactory(organizer=organizer, venue=venue, name="Event Series"),
    )
    event = await persist(
        db_session,
        EventFactory(
            series=series,
            currency=currency,
            name="NLH 10K",
            buyin=Decimal("10000.50"),
            guarantee=Decimal("500000.00"),
            start_stack=30000,
            reentry_count=1,
            late_reg_level=8,
            tags=["bounty"],
        ),
    )
    start_at = datetime(2026, 10, 1, 11, 0, tzinfo=UTC)
    await persist(db_session, FlightFactory(event=event, label=None, start_at=start_at))
    await persist(
        db_session,
        BlindLevelFactory(event=event, level_no=1, sb=100, bb=200, ante=200),
    )
    await persist(
        db_session,
        BlindLevelFactory(
            event=event,
            level_no=2,
            sb=None,
            bb=None,
            ante=None,
            minutes=10,
            is_break=True,
        ),
    )
    await persist(
        db_session,
        BlindLevelFactory(
            event=event,
            level_no=3,
            sb=200,
            bb=400,
            ante=400,
            is_late_reg_end=True,
        ),
    )

    response = await client.get(f"/api/v1/events/{event.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["buyin"] == "10000.50"
    assert body["guarantee"] == "500000.00"
    assert body["start_stack"] == 30000
    assert body["reentry_count"] == 1
    assert body["late_reg_level"] == 8
    assert body["tags"] == ["bounty"]
    assert body["series"]["name"] == "Event Series"
    assert body["venue"]["address"] == "Калининградская обл., пос. Куликово"
    assert body["venue"]["zone"] == "Янтарная"
    flight = body["flights"][0]
    assert flight["label"] is None
    assert flight["start_at"]["venue_timezone"] == "Europe/Moscow"
    assert flight["start_at"]["utc"].endswith("+00:00") or flight["start_at"]["utc"].endswith("Z")
    local = datetime.fromisoformat(flight["start_at"]["venue_local"])
    assert local.astimezone(ZoneInfo("Europe/Moscow")).hour == 14
    assert [level["level_no"] for level in body["blind_levels"]] == [1, 2, 3]
    assert body["blind_levels"][1]["is_break"] is True
    assert body["blind_levels"][2]["is_late_reg_end"] is True

    missing = await client.get(f"/api/v1/events/{UUID('00000000-0000-4000-8000-000000000099')}")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"


async def test_calendar_month_intersection(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, organizer, venue = await _base_graph(db_session, organizer_slug="cal-org")
    # Anchor in a future month so default feed (ends_on >= today) keeps the series.
    today = date.today()
    if today.month >= 11:
        view_year, view_month = today.year + 1, 2
    else:
        view_year, view_month = today.year, today.month + 2
    month_start = date(view_year, view_month, 1)
    if view_month == 1:
        prev_month_end = date(view_year - 1, 12, 31)
    else:
        prev_month_end = month_start - timedelta(days=1)
    span_end = month_start + timedelta(days=1)
    month_key = f"{view_year:04d}-{view_month:02d}"
    prev_key = f"{prev_month_end.year:04d}-{prev_month_end.month:02d}"
    series_start = prev_month_end - timedelta(days=1)

    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Spanning",
            starts_on=series_start,
            ends_on=span_end,
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )

    response = await client.get("/api/v1/calendar", params={"month": month_key})
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == month_key
    assert body["from"] is None
    assert body["to"] is None
    assert len(body["series"]) == 1
    assert body["series"][0]["name"] == "Spanning"
    assert body["series"][0]["is_bookmarked"] is False
    assert body["series"][0]["coverage"] is None
    by_date = {day["date"]: day["series"] for day in body["days"]}
    assert [marker["name"] for marker in by_date[month_start.isoformat()]] == ["Spanning"]
    assert by_date[month_start.isoformat()][0]["is_start"] is False
    assert by_date[span_end.isoformat()][0]["is_end"] is True
    assert by_date[(span_end + timedelta(days=1)).isoformat()] == []

    prev = await client.get("/api/v1/calendar", params={"month": prev_key})
    assert prev.status_code == 200
    prev_body = prev.json()
    assert prev_body["month"] == prev_key
    assert len(prev_body["series"]) == 1
    assert prev_body["series"][0]["name"] == "Spanning"
    prev_by_date = {day["date"]: day["series"] for day in prev_body["days"]}
    assert [marker["name"] for marker in prev_by_date[series_start.isoformat()]] == ["Spanning"]
    assert prev_by_date[series_start.isoformat()][0]["is_start"] is True
    assert prev_by_date[prev_month_end.isoformat()][0]["is_end"] is False


async def test_calendar_period_partial_and_full(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, currency, organizer, venue = await _base_graph(db_session, organizer_slug="cal-period")
    partial = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Partial Edge",
            starts_on=date(2026, 8, 1),
            ends_on=date(2026, 8, 11),
            status=SeriesStatus.RUNNING,
        ),
    )
    full = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Full Inside",
            starts_on=date(2026, 8, 13),
            ends_on=date(2026, 8, 20),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    outside = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Outside",
            starts_on=date(2026, 7, 1),
            ends_on=date(2026, 7, 5),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )

    in_period_event = await persist(
        db_session,
        EventFactory(
            series=partial,
            currency=currency,
            name="In period",
            number=1,
            buyin=Decimal("150.00"),
        ),
    )
    out_period_event = await persist(
        db_session,
        EventFactory(
            series=partial,
            currency=currency,
            name="Before period",
            number=2,
            buyin=Decimal("50.00"),
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=in_period_event,
            label=None,
            start_at=datetime(2026, 8, 10, 12, 0, tzinfo=ZoneInfo("Europe/Moscow")),
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=out_period_event,
            label=None,
            start_at=datetime(2026, 8, 5, 12, 0, tzinfo=ZoneInfo("Europe/Moscow")),
        ),
    )
    full_event = await persist(
        db_session,
        EventFactory(
            series=full,
            currency=currency,
            name="Full event",
            number=1,
            buyin=Decimal("110.00"),
        ),
    )
    await persist(
        db_session,
        FlightFactory(
            event=full_event,
            label=None,
            start_at=datetime(2026, 8, 15, 12, 0, tzinfo=ZoneInfo("Europe/Moscow")),
        ),
    )

    # Reverse from/to — backend swaps.
    response = await client.get(
        "/api/v1/calendar",
        params={"month": "2026-08", "from": "2026-08-24", "to": "2026-08-10"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["from"] == "2026-08-10"
    assert body["to"] == "2026-08-24"
    names = {item["name"] for item in body["series"]}
    assert names == {"Partial Edge", "Full Inside"}
    assert str(outside.id) not in {item["id"] for item in body["series"]}

    by_name = {item["name"]: item for item in body["series"]}
    partial_item = by_name["Partial Edge"]
    assert partial_item["coverage"] == "partial"
    assert partial_item["overlap_starts_on"] == "2026-08-10"
    assert partial_item["overlap_ends_on"] == "2026-08-11"
    assert partial_item["events_in_period"] == 1
    assert partial_item["min_buyins_in_period"][0]["amount"] == "150.00"

    full_item = by_name["Full Inside"]
    assert full_item["coverage"] == "full"
    assert full_item["overlap_starts_on"] == "2026-08-13"
    assert full_item["overlap_ends_on"] == "2026-08-20"
    assert full_item["events_in_period"] == 1
    assert full_item["min_buyins_in_period"][0]["amount"] == "110.00"

    # Month markers still cover displayed month only.
    assert len(body["days"]) == 31


async def test_calendar_period_validation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _base_graph(db_session, organizer_slug="cal-period-val")

    only_from = await client.get(
        "/api/v1/calendar",
        params={"month": "2026-08", "from": "2026-08-10"},
    )
    assert only_from.status_code == 422
    assert only_from.json()["error"]["code"] == "validation_error"

    too_long = await client.get(
        "/api/v1/calendar",
        params={"month": "2026-08", "from": "2026-08-10", "to": "2027-02-11"},
    )
    assert too_long.status_code == 422
    assert too_long.json()["error"]["code"] == "period_too_long"

    # Exactly 6 months is allowed (Aug 10 → Feb 10).
    ok = await client.get(
        "/api/v1/calendar",
        params={"month": "2026-08", "from": "2026-08-10", "to": "2027-02-10"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["from"] == "2026-08-10"
    assert ok.json()["to"] == "2027-02-10"


async def test_calendar_period_with_country_filter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    country_ru, _, organizer_ru, venue_ru = await _base_graph(
        db_session,
        country_code="RU",
        organizer_slug="cal-filter-ru",
    )
    country_by = await persist(
        db_session,
        CountryFactory(code="BY", name_ru="Беларусь"),
    )
    organizer_by = await persist(
        db_session,
        OrganizerFactory(slug="cal-filter-by", name="BY Org"),
    )
    venue_by = await persist(
        db_session,
        VenueFactory(
            country=country_by,
            name="Minsk Club",
            city="Минск",
            timezone="Europe/Minsk",
            zone=None,
        ),
    )
    _ = country_ru
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer_ru,
            venue=venue_ru,
            name="RU Series",
            starts_on=date(2026, 8, 12),
            ends_on=date(2026, 8, 18),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    await persist(
        db_session,
        SeriesFactory(
            organizer=organizer_by,
            venue=venue_by,
            name="BY Series",
            starts_on=date(2026, 8, 12),
            ends_on=date(2026, 8, 18),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )

    response = await client.get(
        "/api/v1/calendar",
        params={
            "month": "2026-08",
            "from": "2026-08-10",
            "to": "2026-08-24",
            "country_code": "BY",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert [item["name"] for item in body["series"]] == ["BY Series"]
    assert body["series"][0]["coverage"] == "full"


async def test_vladivostok_calendar_day_uses_venue_timezone(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """01:00 Asia/Vladivostok = 15:00 previous day UTC → calendar day is venue-local."""
    _, currency, organizer, venue = await _base_graph(
        db_session,
        timezone="Asia/Vladivostok",
        organizer_slug="vvo-org",
        zone=None,
    )
    venue.city = "Владивосток"
    venue.name = "TEST Vladivostok Club"
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="VVO Series",
            starts_on=date(2026, 10, 1),
            ends_on=date(2026, 10, 5),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    event = await persist(
        db_session,
        EventFactory(series=series, currency=currency, name="Late Night", number=1),
    )
    # 2026-10-01 01:00 VVO = 2026-09-30 15:00 UTC
    await persist(
        db_session,
        FlightFactory(
            event=event,
            label=None,
            start_at=datetime(2026, 9, 30, 15, 0, tzinfo=UTC),
        ),
    )

    response = await client.get(f"/api/v1/series/{series.id}")
    assert response.status_code == 200
    days = response.json()["events_by_day"]
    assert len(days) == 1
    assert days[0]["date"] == "2026-10-01"
    assert days[0]["events"][0]["name"] == "Late Night"

    local = datetime(2026, 9, 30, 15, 0, tzinfo=UTC).astimezone(ZoneInfo("Asia/Vladivostok"))
    assert local.date() == date(2026, 10, 1)
    assert datetime(2026, 9, 30, 15, 0, tzinfo=UTC).date() == date(2026, 9, 30)


async def test_calendar_series_bookmark_flag(
    client: AsyncClient,
    db_session: AsyncSession,
    seeded_db: None,
) -> None:
    from app.core.config import get_settings

    organizer = await db_session.scalar(select(Organizer).where(Organizer.slug == "rpt"))
    venue = await db_session.scalar(
        select(Venue).where(Venue.id == UUID("20000000-0000-4000-8000-000000000001"))
    )
    assert organizer is not None
    assert venue is not None
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Bookmarked Series",
            starts_on=date(2026, 8, 5),
            ends_on=date(2026, 8, 7),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )

    guest = await client.get("/api/v1/calendar", params={"month": "2026-08"})
    assert guest.status_code == 200
    guest_body = guest.json()
    guest_series = next(item for item in guest_body["series"] if item["id"] == str(series.id))
    assert guest_series["is_bookmarked"] is False

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)
    created = await client.post(
        "/api/v1/bookmarks",
        json={"target_type": "series", "target_id": str(series.id), "reminder_offsets": []},
    )
    assert created.status_code == 201, created.text

    authed = await client.get("/api/v1/calendar", params={"month": "2026-08"})
    assert authed.status_code == 200
    authed_body = authed.json()
    authed_series = next(item for item in authed_body["series"] if item["id"] == str(series.id))
    assert authed_series["is_bookmarked"] is True
    authed_day = next(day for day in authed_body["days"] if day["date"] == "2026-08-05")["series"][
        0
    ]
    assert authed_day["is_bookmarked"] is True


async def test_not_found_and_validation_error_format(client: AsyncClient) -> None:
    missing = await client.get(f"/api/v1/series/{UUID('00000000-0000-4000-8000-000000000099')}")
    assert missing.status_code == 404
    assert missing.json() == {
        "error": {"code": "not_found", "message": "Series not found"},
    }

    invalid = await client.get("/api/v1/calendar", params={"month": "2026-13"})
    assert invalid.status_code == 422
    payload = invalid.json()
    assert payload["error"]["code"] == "validation_error"
    assert "month" in payload["error"]["message"]


async def test_series_filters_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_reference_data(db_session)
    organizer = await db_session.scalar(select(Organizer).where(Organizer.slug == "rpt"))
    venue = await db_session.scalar(
        select(Venue).where(Venue.id == UUID("20000000-0000-4000-8000-000000000001"))
    )
    currency = await db_session.scalar(select(Currency).where(Currency.code == "RUB"))
    assert organizer is not None
    assert venue is not None
    assert currency is not None

    series = await persist(
        db_session,
        SeriesFactory(organizer=organizer, venue=venue, name="Tagged"),
    )
    await persist(
        db_session,
        EventFactory(series=series, currency=currency, tags=["main", "bounty"]),
    )

    response = await client.get("/api/v1/series/filters")
    assert response.status_code == 200
    body = response.json()
    assert any(item["code"] == "RU" for item in body["countries"])
    assert "Красная Поляна" in body["zones"]
    assert "main" in body["tags"]
    assert "bounty" in body["tags"]
    assert "nlh" in body["game_types"]
    assert "schedule_published" in body["statuses"]


async def test_detail_endpoints_use_eager_loading(
    client: AsyncClient,
    db_session: AsyncSession,
    test_engine: AsyncEngine,
) -> None:
    _, currency, organizer, venue = await _base_graph(db_session, organizer_slug="eager")
    series = await persist(
        db_session,
        SeriesFactory(organizer=organizer, venue=venue, name="Eager Series"),
    )
    for index in range(3):
        event = await persist(
            db_session,
            EventFactory(
                series=series,
                currency=currency,
                name=f"Event {index}",
                number=index + 1,
            ),
        )
        await persist(
            db_session,
            FlightFactory(
                event=event,
                start_at=datetime(2026, 11, 1 + index, 12, 0, tzinfo=UTC),
            ),
        )
        await persist(db_session, BlindLevelFactory(event=event, level_no=1))

    statements: list[str] = []

    def before_cursor_execute(
        _conn: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        statements.append(statement)

    sa_event.listen(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)
    try:
        series_response = await client.get(f"/api/v1/series/{series.id}")
        series_queries = len(statements)
        statements.clear()
        event_id = series_response.json()["events_by_day"][0]["events"][0]["id"]
        event_response = await client.get(f"/api/v1/events/{event_id}")
        event_queries = len(statements)
    finally:
        sa_event.remove(
            test_engine.sync_engine,
            "before_cursor_execute",
            before_cursor_execute,
        )

    assert series_response.status_code == 200
    assert event_response.status_code == 200
    # One root query + selectinloads; must stay well below N+1 (3 events * flights).
    assert series_queries <= 8
    assert event_queries <= 10


async def test_list_series_actual_status_and_alias_params(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, currency, organizer, venue = await _base_graph(db_session, organizer_slug="actual-org")
    starts = date.today() + timedelta(days=5)

    running = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Actual Running",
            starts_on=starts,
            ends_on=starts + timedelta(days=3),
            status=SeriesStatus.RUNNING,
        ),
    )
    await persist(
        db_session,
        EventFactory(series=running, currency=currency, buyin=Decimal("12000.00")),
    )

    cancelled = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Actual Cancelled",
            starts_on=starts,
            ends_on=starts + timedelta(days=3),
            status=SeriesStatus.CANCELLED,
        ),
    )
    await persist(
        db_session,
        EventFactory(series=cancelled, currency=currency, buyin=Decimal("5000.00")),
    )

    finished = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Actual Finished",
            starts_on=starts,
            ends_on=starts + timedelta(days=3),
            status=SeriesStatus.FINISHED,
        ),
    )
    await persist(
        db_session,
        EventFactory(series=finished, currency=currency, buyin=Decimal("8000.00")),
    )

    actual = await client.get(
        "/api/v1/series",
        params={
            "status": "actual",
            "country": "RU",
            "organizer": str(organizer.id),
            "max_buyin": "15000",
        },
    )
    assert actual.status_code == 200
    names = {item["name"] for item in actual.json()["items"]}
    assert "Actual Running" in names
    assert "Actual Cancelled" not in names
    assert "Actual Finished" not in names

    default_feed = await client.get("/api/v1/series")
    default_names = {item["name"] for item in default_feed.json()["items"]}
    assert "Actual Cancelled" in default_names

    invalid = await client.get("/api/v1/series", params={"status": "nope"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"


async def test_list_series_min_buyins_by_currency(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, rub, organizer, venue = await _base_graph(db_session, organizer_slug="min-buyin")
    usd = await persist(db_session, CurrencyFactory(code="USD", symbol="$"))
    starts = date.today() + timedelta(days=8)
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Multi Currency",
            starts_on=starts,
            ends_on=starts + timedelta(days=4),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    await persist(
        db_session,
        EventFactory(series=series, currency=rub, buyin=Decimal("20000.00")),
    )
    await persist(
        db_session,
        EventFactory(series=series, currency=rub, buyin=Decimal("11000.00")),
    )
    await persist(
        db_session,
        EventFactory(series=series, currency=usd, buyin=Decimal("250.00")),
    )
    await persist(
        db_session,
        EventFactory(series=series, currency=usd, buyin=Decimal("110.00")),
    )

    response = await client.get("/api/v1/series", params={"status": "actual"})
    assert response.status_code == 200
    item = next(row for row in response.json()["items"] if row["name"] == "Multi Currency")
    assert item["events_count"] == 4
    assert item["min_buyins"] == [
        {"amount": "11000.00", "currency": {"code": "RUB", "symbol": "₽"}},
        {"amount": "110.00", "currency": {"code": "USD", "symbol": "$"}},
    ]

    detail = await client.get(f"/api/v1/series/{series.id}")
    assert detail.status_code == 200
    assert detail.json()["min_buyins"] == item["min_buyins"]


async def test_demo_schedule_seed_idempotent(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_demo_schedule(db_session)
    await seed_demo_schedule(db_session)

    expected = {
        SAMPLE_APC_SERIES_ID: 74,
        DEMO_SERIES_ID: 61,
        SAMPLE_RPT_SERIES_ID: 21,
    }
    for series_id, events_count in expected.items():
        series_count = await db_session.scalar(
            select(func.count()).select_from(Series).where(Series.id == series_id)
        )
        event_count = await db_session.scalar(
            select(func.count()).select_from(Event).where(Event.series_id == series_id)
        )
        assert series_count == 1
        assert event_count == events_count


async def test_running_series_card_stats_today_and_highlight(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, currency, organizer, venue = await _base_graph(
        db_session,
        timezone="Europe/Moscow",
        organizer_slug="card-stats",
    )
    today_local = datetime.now(ZoneInfo("Europe/Moscow")).date()
    series = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Live Card Stats",
            starts_on=today_local - timedelta(days=2),
            ends_on=today_local + timedelta(days=5),
            status=SeriesStatus.RUNNING,
        ),
    )
    today_event = await persist(
        db_session,
        EventFactory(series=series, currency=currency, name="Daily Soft", tags=[]),
    )
    main_event = await persist(
        db_session,
        EventFactory(series=series, currency=currency, name="Main Event", tags=["main"]),
    )
    # Venue-local noon today / tomorrow as UTC.
    today_start = datetime(
        today_local.year,
        today_local.month,
        today_local.day,
        12,
        0,
        tzinfo=ZoneInfo("Europe/Moscow"),
    ).astimezone(UTC)
    main_day = today_local + timedelta(days=3)
    main_start = datetime(
        main_day.year,
        main_day.month,
        main_day.day,
        14,
        0,
        tzinfo=ZoneInfo("Europe/Moscow"),
    ).astimezone(UTC)
    await persist(db_session, FlightFactory(event=today_event, start_at=today_start))
    await persist(db_session, FlightFactory(event=main_event, start_at=main_start))

    response = await client.get("/api/v1/series", params={"status": "running"})
    assert response.status_code == 200
    item = next(row for row in response.json()["items"] if row["name"] == "Live Card Stats")
    assert item["today_events_count"] == 1
    assert item["highlight"] == {
        "name": "Main Event",
        "date": main_day.isoformat(),
    }
    assert item["organizer"]["logo_url"] is None


async def test_actual_feed_excludes_past_by_ends_on(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, currency, organizer, venue = await _base_graph(
        db_session,
        organizer_slug="past-filter",
    )
    past = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Past Published",
            starts_on=date.today() - timedelta(days=20),
            ends_on=date.today() - timedelta(days=5),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    await persist(db_session, EventFactory(series=past, currency=currency))
    future = await persist(
        db_session,
        SeriesFactory(
            organizer=organizer,
            venue=venue,
            name="Future Published",
            starts_on=date.today() + timedelta(days=5),
            ends_on=date.today() + timedelta(days=12),
            status=SeriesStatus.SCHEDULE_PUBLISHED,
        ),
    )
    await persist(db_session, EventFactory(series=future, currency=currency))

    response = await client.get("/api/v1/series", params={"status": "actual"})
    assert response.status_code == 200
    names = {item["name"] for item in response.json()["items"]}
    assert "Future Published" in names
    assert "Past Published" not in names
