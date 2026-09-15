from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashTable
from app.models.clubs import Club
from app.models.enums import GameType
from app.models.tournaments import Tournament

pytestmark = pytest.mark.integration


async def test_editor_picks_show_next_start_and_open_tables(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    club = await db_session.scalar(select(Club).where(Club.slug == "ginger"))
    assert club is not None
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    db_session.add_all(
        [
            Tournament(
                club_id=club.id,
                name="DREAM RIVER",
                lobby_name="Dream River 5K GTD",
                buyin=Decimal("16"),
                starts_at=now + timedelta(days=1),
            ),
            Tournament(
                club_id=club.id,
                name="DREAM RIVER",
                buyin=Decimal("16"),
                starts_at=now + timedelta(hours=3),
            ),
            CashTable(
                club_id=club.id,
                table_key="fox",
                name="Fox Den 25/50",
                game_type=GameType.NLH,
                small_blind=Decimal("0.25"),
                big_blind=Decimal("0.5"),
                first_seen_at=now,
                seen_at=now,
            ),
        ]
    )
    await db_session.flush()

    created = await admin_client.post(
        "/api/v1/admin/editor-picks",
        json={
            "kind": "mtt",
            "club_id": str(club.id),
            "match": "dream river",
            "note": "Гарантия ×300 к бай-ину",
        },
    )
    assert created.status_code == 201, created.text
    await admin_client.post(
        "/api/v1/admin/editor-picks",
        json={"kind": "cash", "club_id": str(club.id), "match": "Fox Den"},
    )
    picks = (
        await admin_client.post(
            "/api/v1/admin/editor-picks",
            json={"kind": "mtt", "club_id": str(club.id), "match": "Нет такого"},
        )
    ).json()
    assert {(pick["match"], pick["matched_now"]) for pick in picks} == {
        ("dream river", 2),
        ("Fox Den", 1),
        ("Нет такого", 0),
    }

    mtt = (await admin_client.get("/api/v1/editor-picks", params={"kind": "mtt"})).json()
    # Пик без совпадений игроку не отдаём; из двух стартов — ближайший.
    assert len(mtt) == 1
    assert mtt[0]["note"] == "Гарантия ×300 к бай-ину"
    assert mtt[0]["tournament"]["starts_at"].startswith((now + timedelta(hours=3)).isoformat()[:16])

    cash = (await admin_client.get("/api/v1/editor-picks", params={"kind": "cash"})).json()
    assert [table["name"] for table in cash[0]["tables"]] == ["Fox Den 25/50"]

    dream = next(pick for pick in picks if pick["match"] == "dream river")
    updated = await admin_client.patch(
        f"/api/v1/admin/editor-picks/{dream['id']}", json={"is_active": False}
    )
    assert updated.status_code == 200
    assert (await admin_client.get("/api/v1/editor-picks", params={"kind": "mtt"})).json() == []

    deleted = await admin_client.delete(f"/api/v1/admin/editor-picks/{dream['id']}")
    assert [pick["match"] for pick in deleted.json()] == ["Fox Den", "Нет такого"] or [
        pick["match"] for pick in deleted.json()
    ] == ["Нет такого", "Fox Den"]


async def test_editor_picks_admin_requires_staff(user_client: AsyncClient) -> None:
    response = await user_client.get("/api/v1/admin/editor-picks")
    assert response.status_code == 403
