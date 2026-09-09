from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import User
from app.models.references import FxRate
from app.models.schedule import Event, Series
from app.models.tracker import Result
from app.seeds import seed_reference_data
from app.seeds.demo_schedule import DEMO_EVENT_MAIN_ID, seed_demo_schedule
from app.seeds.dev_users import seed_dev_users
from tests.conftest import login_as

pytestmark = pytest.mark.integration


async def _prepare(db_session: AsyncSession) -> None:
    await seed_reference_data(db_session)
    await seed_dev_users(db_session)
    await seed_demo_schedule(db_session)


async def _seed_rates(db_session: AsyncSession) -> None:
    rates = [
        ("USD", date(2024, 6, 7), Decimal("90.000000")),
        ("EUR", date(2024, 6, 7), Decimal("100.000000")),
        ("BYN", date(2024, 6, 7), Decimal("28.000000")),
        ("USD", date(2024, 6, 10), Decimal("91.000000")),
        ("EUR", date(2024, 6, 10), Decimal("101.000000")),
        ("BYN", date(2024, 6, 10), Decimal("28.500000")),
    ]
    for code, rate_date, rate_rub in rates:
        db_session.add(FxRate(currency_code=code, rate_date=rate_date, rate_rub=rate_rub))
    await db_session.flush()


async def test_stats_control_set_multicurrency_and_chart(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    await _seed_rates(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    user.base_currency = "RUB"
    await db_session.flush()

    event = await db_session.scalar(
        select(Event)
        .where(Event.id == DEMO_EVENT_MAIN_ID)
        .options(selectinload(Event.series).selectinload(Series.venue))
    )
    assert event is not None

    db_session.add(
        Result(
            user_id=user.id,
            event_id=event.id,
            name="#1 Main Event",
            venue_text=event.series.venue.name,
            series_text=event.series.name,
            played_on=date(2024, 6, 10),
            buyin=Decimal("70000.00"),
            currency_code="RUB",
            entries_count=2,
            payout=Decimal("110000.00"),
            place=10,
            field_size=100,
        )
    )
    db_session.add(
        Result(
            user_id=user.id,
            name="EUR Satellite",
            venue_text="Limassol",
            played_on=date(2024, 6, 8),
            buyin=Decimal("100.00"),
            currency_code="EUR",
            entries_count=1,
            payout=Decimal("0.00"),
        )
    )
    db_session.add(
        Result(
            user_id=user.id,
            name="USD Turbo",
            played_on=date(2024, 6, 10),
            buyin=Decimal("50.00"),
            currency_code="USD",
            entries_count=1,
            payout=Decimal("200.00"),
        )
    )
    db_session.add(
        Result(
            user_id=user.id,
            name="BYN Deep",
            played_on=date(2024, 6, 10),
            buyin=Decimal("100.00"),
            currency_code="BYN",
            entries_count=2,
            payout=Decimal("0.00"),
        )
    )
    await db_session.flush()

    await login_as(client, settings.seed_editor_email)
    stats = await client.get("/api/v1/stats")
    assert stats.status_code == 200, stats.text
    data = stats.json()
    assert data["tournaments"] == 4
    assert data["entries"] == 6
    assert data["invested"] == "160250.00"
    assert data["won"] == "128200.00"
    assert data["profit"] == "-32050.00"
    assert data["roi"] == "-20.00"
    # ABI = invested / entries = 160250 / 6
    assert data["abi"] == "26708.33"
    assert data["itm"] == "50.00"

    chart = await client.get("/api/v1/stats/chart")
    assert chart.status_code == 200
    points = chart.json()["points"]
    assert len(points) == 4
    assert points[0]["label"] == "EUR Satellite"
    assert points[0]["profit"] == "-10000.00"
    assert points[-1]["cumulative_profit"] == "-32050.00"

    patched = await client.patch("/api/v1/auth/me", json={"base_currency": "EUR"})
    assert patched.status_code == 200, patched.text
    stats_eur = await client.get("/api/v1/stats")
    assert stats_eur.status_code == 200, stats_eur.text
    eur = stats_eur.json()

    rub_buyin = (Decimal("70000") / Decimal("101")).quantize(Decimal("0.01"))
    rub_invested = (rub_buyin * 2).quantize(Decimal("0.01"))
    rub_won = (Decimal("110000") / Decimal("101")).quantize(Decimal("0.01"))
    usd_buyin = (Decimal("50") * Decimal("91") / Decimal("101")).quantize(Decimal("0.01"))
    usd_won = (Decimal("200") * Decimal("91") / Decimal("101")).quantize(Decimal("0.01"))
    byn_buyin = (Decimal("100") * Decimal("28.5") / Decimal("101")).quantize(Decimal("0.01"))
    byn_invested = (byn_buyin * 2).quantize(Decimal("0.01"))
    expected_invested = (Decimal("100.00") + rub_invested + usd_buyin + byn_invested).quantize(
        Decimal("0.01")
    )
    expected_won = (rub_won + usd_won).quantize(Decimal("0.01"))
    expected_profit = (expected_won - expected_invested).quantize(Decimal("0.01"))
    assert eur["base_currency"] == "EUR"
    assert eur["invested"] == format(expected_invested, "f")
    assert eur["won"] == format(expected_won, "f")
    assert eur["profit"] == format(expected_profit, "f")


async def test_stats_filters_buyin_and_relational_and_missing_fx(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _prepare(db_session)
    await _seed_rates(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    event = await db_session.scalar(
        select(Event)
        .where(Event.id == DEMO_EVENT_MAIN_ID)
        .options(selectinload(Event.series).selectinload(Series.venue))
    )
    assert event is not None

    db_session.add(
        Result(
            user_id=user.id,
            event_id=event.id,
            name="Linked",
            venue_text="KP",
            series_text="Demo",
            played_on=date(2024, 6, 10),
            buyin=Decimal("70000.00"),
            currency_code="RUB",
            entries_count=1,
            payout=Decimal("0"),
        )
    )
    db_session.add(
        Result(
            user_id=user.id,
            name="Manual small",
            played_on=date(2024, 6, 10),
            buyin=Decimal("10.00"),
            currency_code="USD",
            entries_count=1,
            payout=Decimal("0"),
        )
    )
    await db_session.flush()

    await login_as(client, settings.seed_editor_email)

    filters = await client.get("/api/v1/stats/filters")
    assert filters.status_code == 200
    assert len(filters.json()["series"]) == 1
    assert len(filters.json()["venues"]) == 1
    assert filters.json()["countries"][0]["code"] == "RU"

    by_series = await client.get(
        "/api/v1/stats",
        params={"series_id": str(event.series_id)},
    )
    assert by_series.status_code == 200
    assert by_series.json()["tournaments"] == 1

    buyin_filter = await client.get(
        "/api/v1/stats",
        params={"buyin_min": "500", "buyin_max": "1000"},
    )
    assert buyin_filter.status_code == 200
    assert buyin_filter.json()["tournaments"] == 1
    assert buyin_filter.json()["invested"] == "910.00"

    db_session.add(
        Result(
            user_id=user.id,
            name="Old USD",
            played_on=date(2020, 1, 1),
            buyin=Decimal("10.00"),
            currency_code="USD",
            entries_count=1,
            payout=Decimal("0"),
        )
    )
    await db_session.flush()
    missing = await client.get("/api/v1/stats")
    assert missing.status_code == 409
    assert missing.json()["error"]["code"] == "fx_rate_missing"


@pytest.mark.parametrize(
    ("buyin", "entries", "payout", "expected_profit"),
    [
        # profit = payout - buyin * entries (all RUB, rate 1)
        ("10000.00", 1, "0.00", "-10000.00"),
        ("10000.00", 2, "35000.00", "15000.00"),
        ("5000.00", 3, "5000.00", "-10000.00"),
    ],
)
async def test_profit_table_cases(
    client: AsyncClient,
    db_session: AsyncSession,
    buyin: str,
    entries: int,
    payout: str,
    expected_profit: str,
) -> None:
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    await login_as(client, settings.seed_editor_email)

    created = await client.post(
        "/api/v1/results",
        json={
            "name": f"Profit {buyin}x{entries}",
            "played_on": "2024-06-10",
            "buyin": buyin,
            "currency_code": "RUB",
            "entries_count": entries,
            "payout": payout,
        },
    )
    assert created.status_code == 201, created.text

    listed = await client.get("/api/v1/results")
    assert listed.status_code == 200
    item = next(row for row in listed.json()["items"] if row["id"] == created.json()["id"])
    assert item["profit_base"] == expected_profit

    stats = await client.get("/api/v1/stats")
    assert stats.status_code == 200
    assert stats.json()["profit"] == expected_profit


async def test_stats_ten_record_control_set(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """ROI/ABI/ITM on 10 RUB results — expected values are handwritten literals.

    Control set (buyin, entries, payout):
      1: (10000, 1, 0)      profit -10000
      2: (10000, 1, 20000)  profit +10000  ITM
      3: (5000,  2, 0)      profit -10000
      4: (5000,  1, 15000)  profit +10000  ITM
      5: (20000, 1, 0)      profit -20000
      6: (20000, 1, 50000)  profit +30000  ITM
      7: (15000, 1, 0)      profit -15000
      8: (8000,  1, 8000)   profit 0       ITM
      9: (12000, 1, 0)      profit -12000
     10: (7000,  1, 0)      profit -7000

    invested = 10000+10000+10000+5000+20000+20000+15000+8000+12000+7000 = 117000
    won      = 0+20000+0+15000+0+50000+0+8000+0+0 = 93000
    profit   = 93000 - 117000 = -24000
    roi      = -24000/117000 * 100 = -20.5128… → -20.51
    entries  = 1+1+2+1+1+1+1+1+1+1 = 11
    abi      = 117000/11 = 10636.3636… → 10636.36
    itm      = 4/10 * 100 = 40.00
    """
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    user.base_currency = "RUB"
    await db_session.flush()

    rows = [
        (Decimal("10000"), 1, Decimal("0")),
        (Decimal("10000"), 1, Decimal("20000")),
        (Decimal("5000"), 2, Decimal("0")),
        (Decimal("5000"), 1, Decimal("15000")),
        (Decimal("20000"), 1, Decimal("0")),
        (Decimal("20000"), 1, Decimal("50000")),
        (Decimal("15000"), 1, Decimal("0")),
        (Decimal("8000"), 1, Decimal("8000")),
        (Decimal("12000"), 1, Decimal("0")),
        (Decimal("7000"), 1, Decimal("0")),
    ]
    for index, (buyin, entries, payout) in enumerate(rows, start=1):
        db_session.add(
            Result(
                user_id=user.id,
                name=f"Control {index}",
                played_on=date(2024, 6, 10),
                buyin=buyin,
                currency_code="RUB",
                entries_count=entries,
                payout=payout,
            )
        )
    await db_session.flush()

    await login_as(client, settings.seed_editor_email)
    stats = await client.get("/api/v1/stats")
    assert stats.status_code == 200, stats.text
    data = stats.json()
    assert data["tournaments"] == 10
    assert data["entries"] == 11
    assert data["invested"] == "117000.00"
    assert data["won"] == "93000.00"
    assert data["profit"] == "-24000.00"
    assert data["roi"] == "-20.51"
    assert data["abi"] == "10636.36"
    assert data["itm"] == "40.00"


async def test_stats_abi_divides_by_entries_not_tournaments(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """ABI = invested / entries; re-entries must lower ABI vs /tournaments.

    Set A — no re-entry:
      2 tournaments × 10000 × 1 entry → invested 20000, entries 2, ABI 10000

    Set B — with re-entry (same buyins):
      2 tournaments × 10000, entries 2 each → invested 40000, entries 4, ABI 10000
      (old formula invested/tournaments would wrongly give 20000)
    """
    await _prepare(db_session)
    from app.core.config import get_settings

    settings = get_settings()
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    user.base_currency = "RUB"
    await db_session.flush()

    for index, entries in enumerate((1, 1), start=1):
        db_session.add(
            Result(
                user_id=user.id,
                name=f"No re-entry {index}",
                played_on=date(2024, 6, 10),
                buyin=Decimal("10000.00"),
                currency_code="RUB",
                entries_count=entries,
                payout=Decimal("0"),
            )
        )
    await db_session.flush()

    await login_as(client, settings.seed_editor_email)
    no_re = (await client.get("/api/v1/stats")).json()
    assert no_re["tournaments"] == 2
    assert no_re["entries"] == 2
    assert no_re["invested"] == "20000.00"
    assert no_re["abi"] == "10000.00"

    for index, entries in enumerate((2, 2), start=1):
        db_session.add(
            Result(
                user_id=user.id,
                name=f"Re-entry {index}",
                played_on=date(2024, 6, 11),
                buyin=Decimal("10000.00"),
                currency_code="RUB",
                entries_count=entries,
                payout=Decimal("0"),
            )
        )
    await db_session.flush()

    with_re = (await client.get("/api/v1/stats")).json()
    assert with_re["tournaments"] == 4
    assert with_re["entries"] == 6
    assert with_re["invested"] == "60000.00"
    assert with_re["abi"] == "10000.00"

    # Isolated re-entry-only view via date filter
    only_re = (
        await client.get("/api/v1/stats", params={"date_from": "2024-06-11", "date_to": "2024-06-11"})
    ).json()
    assert only_re["tournaments"] == 2
    assert only_re["entries"] == 4
    assert only_re["invested"] == "40000.00"
    assert only_re["abi"] == "10000.00"
