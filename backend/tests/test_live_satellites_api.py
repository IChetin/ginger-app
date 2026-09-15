from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.tournaments import Tournament

pytestmark = pytest.mark.integration


async def test_live_path_leaves_schedule_and_satellites_show_on_target(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    club = await db_session.scalar(select(Club).where(Club.slug == "ginger-plus"))
    assert club is not None
    now = datetime.now(UTC)
    target = Tournament(
        club_id=club.id,
        name="Grand Knockout Main Bounty",
        lobby_name="GRAND KNOCKOUT",
        buyin=Decimal("25"),
        starts_at=now + timedelta(days=2),
    )
    # Дешёвый сателлит в общем списке скрыт, а в карточке целевого турнира нужен.
    satellite = Tournament(
        club_id=club.id,
        name="Sat 2 Million",
        buyin=Decimal("1"),
        ticket_value=Decimal("1"),
        satellite_target="grand knockout main bounty",
        notes="4 билета",
        starts_at=now + timedelta(hours=5),
    )
    step = Tournament(
        club_id=club.id,
        name="ME APC45 STEP",
        buyin=Decimal("5"),
        live_event="APC45 Main Event",
        live_dates="8–11 октября",
        live_step=1,
        starts_at=now + timedelta(hours=6),
    )
    final = Tournament(
        club_id=club.id,
        name="Main Event APC45",
        buyin=Decimal("300"),
        live_event="APC45 Main Event",
        starts_at=now + timedelta(days=20),
    )
    db_session.add_all([target, satellite, step, final])
    await db_session.flush()

    listed = await client.get(
        "/api/v1/tournaments",
        params={"from": now.isoformat(), "to": (now + timedelta(days=3)).isoformat()},
    )
    assert listed.status_code == 200, listed.text
    ids = {item["id"] for item in listed.json()}
    assert str(target.id) in ids
    assert str(step.id) not in ids

    live = (await client.get("/api/v1/tournaments/live")).json()
    event = next(item for item in live if item["title"] == "APC45 Main Event")
    assert event["dates"] == "8–11 октября"
    assert [item["id"] for item in event["items"]] == [str(step.id), str(final.id)]

    satellites = (await client.get(f"/api/v1/tournaments/{target.id}/satellites")).json()
    assert [item["id"] for item in satellites] == [str(satellite.id)]
    assert satellites[0]["notes"] == "4 билета"
