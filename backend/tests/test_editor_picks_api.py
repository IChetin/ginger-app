from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashGame
from app.models.clubs import Club
from app.models.enums import GameType
from app.models.tournaments import Tournament

pytestmark = pytest.mark.integration


async def test_editor_picks_flag_tournaments_and_cash(
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
            Tournament(
                club_id=club.id,
                name="CRAZY",
                buyin=Decimal("8"),
                starts_at=now + timedelta(hours=2),
            ),
            CashGame(
                club_id=club.id,
                game_type=GameType.PLO5,
                small_blind=Decimal("1"),
                big_blind=Decimal("2"),
                tables=2,
                first_seen_at=now,
                seen_at=now,
            ),
            CashGame(
                club_id=club.id,
                game_type=GameType.NLH,
                small_blind=Decimal("0.1"),
                big_blind=Decimal("0.2"),
                tables=3,
                first_seen_at=now,
                seen_at=now,
            ),
        ]
    )
    await db_session.flush()
    base = {"club_id": str(club.id)}

    created = await admin_client.post(
        "/api/v1/admin/editor-picks",
        json={**base, "kind": "mtt", "match": "dream river", "note": "Гарантия ×300 к бай-ину"},
    )
    assert created.status_code == 201, created.text
    await admin_client.post(
        "/api/v1/admin/editor-picks",
        json={**base, "kind": "cash", "game_type": "plo5", "big_blind": "2", "note": "Мягко"},
    )
    no_game = await admin_client.post("/api/v1/admin/editor-picks", json={**base, "kind": "cash"})
    assert no_game.status_code == 422
    picks = (
        await admin_client.post(
            "/api/v1/admin/editor-picks", json={**base, "kind": "mtt", "match": "Нет такого"}
        )
    ).json()
    assert {(pick["match"], pick["game_type"], pick["matched_now"]) for pick in picks} == {
        ("dream river", None, 2),
        (None, "plo5", 2),
        ("Нет такого", None, 0),
    }

    params = {"from": now.isoformat(), "to": (now + timedelta(days=2)).isoformat()}
    tournaments = (await admin_client.get("/api/v1/tournaments", params=params)).json()
    flags = {
        (item["name"], item["is_editor_pick"], item["editor_pick_note"]) for item in tournaments
    }
    # Отобраны все старты турнира за период, а не только ближайший.
    assert flags == {
        ("DREAM RIVER", True, "Гарантия ×300 к бай-ину"),
        ("CRAZY", False, None),
    }
    assert sum(item["is_editor_pick"] for item in tournaments) == 2

    cash = (await admin_client.get("/api/v1/cash-games")).json()
    assert {(item["game_type"], item["is_editor_pick"]) for item in cash} == {
        ("plo5", True),
        ("nlh", False),
    }

    dream = next(pick for pick in picks if pick["match"] == "dream river")
    hidden = await admin_client.patch(
        f"/api/v1/admin/editor-picks/{dream['id']}", json={"is_active": False}
    )
    assert hidden.status_code == 200
    tournaments = (await admin_client.get("/api/v1/tournaments", params=params)).json()
    assert not any(item["is_editor_pick"] for item in tournaments)

    deleted = await admin_client.delete(f"/api/v1/admin/editor-picks/{dream['id']}")
    assert "dream river" not in {pick["match"] for pick in deleted.json()}


async def test_editor_picks_admin_requires_staff(user_client: AsyncClient) -> None:
    response = await user_client.get("/api/v1/admin/editor-picks")
    assert response.status_code == 403
