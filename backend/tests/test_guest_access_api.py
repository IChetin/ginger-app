from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.models.cash import CashGame
from app.models.clubs import Club
from app.models.enums import GameType
from app.models.picks import EditorPick
from app.models.tournaments import Tournament

pytestmark = pytest.mark.integration


async def _seed(db_session: AsyncSession) -> datetime:
    club = await db_session.scalar(select(Club).where(Club.slug == "ginger"))
    assert club is not None
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    db_session.add_all(
        [
            Tournament(
                club_id=club.id,
                name="SOON PKO",
                buyin=Decimal("8"),
                guarantee=Decimal("500"),
                start_stack=20000,
                level_minutes="12/10/8",
                notes="Секретная заметка",
                app_link="https://pppoker.club/t/1",
                starts_at=now + timedelta(hours=2),
            ),
            Tournament(
                club_id=club.id,
                name="LATER DEEP",
                buyin=Decimal("16"),
                starts_at=now + timedelta(hours=30),
            ),
            CashGame(
                club_id=club.id,
                game_type=GameType.NLH,
                small_blind=Decimal("0.1"),
                big_blind=Decimal("0.2"),
                tables=3,
                app_link="https://pppoker.club/table/1",
                first_seen_at=now,
                seen_at=now,
            ),
            EditorPick(kind="mtt", club_id=club.id, match="soon", note="Почему"),
            EditorPick(kind="cash", club_id=club.id, game_type=GameType.NLH),
        ]
    )
    await db_session.flush()
    return now


async def test_guest_sees_one_day_without_details(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    now = await _seed(db_session)
    week = {"from": now.isoformat(), "to": (now + timedelta(days=7)).isoformat()}

    items = (await client.get("/api/v1/tournaments", params=week)).json()
    assert [item["name"] for item in items] == ["SOON PKO"]
    soon = items[0]
    assert soon["guarantee"] == "500.00"
    assert soon["start_stack"] is None
    assert soon["level_minutes"] is None
    assert soon["notes"] is None
    assert soon["app_link"] is None
    assert soon["is_editor_pick"] is False

    # Начало периода в будущем гостю не сдвинуть: окно всё равно от «сейчас».
    later = {
        "from": (now + timedelta(days=1)).isoformat(),
        "to": (now + timedelta(days=2)).isoformat(),
    }
    assert [i["name"] for i in (await client.get("/api/v1/tournaments", params=later)).json()] == [
        "SOON PKO"
    ]

    assert (await client.get("/api/v1/tournaments/live")).json() == []
    assert (await client.get(f"/api/v1/tournaments/{soon['id']}/satellites")).json() == []

    cash = (await client.get("/api/v1/cash-games")).json()
    assert cash[0]["app_link"] is None
    assert cash[0]["is_editor_pick"] is False


async def test_player_sees_week_with_details(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    now = await _seed(db_session)
    week = {"from": now.isoformat(), "to": (now + timedelta(days=7)).isoformat()}

    items = (await admin_client.get("/api/v1/tournaments", params=week)).json()
    assert [item["name"] for item in items] == ["SOON PKO", "LATER DEEP"]
    assert items[0]["start_stack"] == 20000
    assert items[0]["is_editor_pick"] is True

    cash = (await admin_client.get("/api/v1/cash-games")).json()
    assert cash[0]["app_link"] == "https://pppoker.club/table/1"
    assert cash[0]["is_editor_pick"] is True


async def test_rate_limit_answers_429_with_retry_after(
    client: AsyncClient, seeded_db: None
) -> None:
    limiter.reset()
    headers = {"x-rate-limit-test": "1"}
    statuses = [
        (await client.get("/api/v1/cash-games", headers=headers)).status_code for _ in range(61)
    ]
    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429
    body = (await client.get("/api/v1/cash-games", headers=headers)).json()
    assert body["error"]["code"] == "rate_limited"
    assert body["error"]["retry_after"] > 0
    limiter.reset()
