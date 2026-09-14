from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.clubs import Club
from app.models.feed import PlayerWin
from app.models.players import Player
from app.models.tournaments import Tournament
from app.services.feed import ANONYMOUS_NICKNAME
from app.services.tournaments.schedule_sync import MSK

pytestmark = pytest.mark.integration


async def _club(db_session: AsyncSession, slug: str) -> Club:
    club = await db_session.scalar(select(Club).where(Club.slug == slug))
    assert club is not None
    return club


def _at(day_offset: int, hour: int) -> datetime:
    """Старт через `day_offset` дней в `hour`:00 по Москве."""
    base = datetime.now(MSK).date() + timedelta(days=day_offset)
    return datetime(base.year, base.month, base.day, hour, tzinfo=MSK)


def _tournament(club: Club, name: str, starts_at: datetime, **kw: object) -> Tournament:
    fields: dict[str, object] = {"buyin": Decimal("10"), "guarantee": Decimal("1000")}
    fields.update(kw)
    return Tournament(club_id=club.id, name=name, starts_at=starts_at, **fields)


async def test_feed_is_public_with_main_events_and_evening_per_club(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ginger21 = await _club(db_session, "ginger21")  # 1 фишка = 1 ₽
    private_g = await _club(db_session, "private-g")  # 1 фишка = 100 ₽
    db_session.add_all(
        [
            # Завтра: главное событие дня — днём, но с крупнейшей гарантией.
            _tournament(ginger21, "Big Sunday", _at(1, 14), guarantee=Decimal("500000")),
            _tournament(ginger21, "Evening Small", _at(1, 19), guarantee=Decimal("20000")),
            _tournament(ginger21, "Evening Big", _at(1, 20), guarantee=Decimal("150000")),
            _tournament(ginger21, "Night", _at(1, 23), guarantee=Decimal("400000")),
            # Сателлит в ленту не попадает, даже с гарантией.
            _tournament(
                private_g,
                "Sat Main",
                _at(1, 18),
                guarantee=Decimal("99999"),
                satellite_target="Main",
                ticket_value=Decimal("100"),
            ),
            _tournament(private_g, "PG Evening", _at(1, 21), guarantee=Decimal("300")),
        ]
    )
    await db_session.flush()

    response = await client.get("/api/v1/feed")
    assert response.status_code == 200, response.text
    feed = response.json()

    tomorrow = _at(1, 12).date().isoformat()
    main_tomorrow = [item for item in feed["main_events"] if item["starts_at"].startswith(tomorrow)]
    assert [item["name"] for item in main_tomorrow] == ["Big Sunday"]

    evening = {item["club"]["slug"]: item["name"] for item in feed["evening"]}
    assert evening["ginger21"] == "Evening Big"
    assert evening["private-g"] == "PG Evening"
    assert all("Sat" not in name for name in evening.values())


async def test_admin_adds_win_and_feed_respects_consent(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    club = await _club(db_session, "ginger-plus")
    created = await admin_client.post(
        "/api/v1/admin/wins",
        json={
            "player_nickname": " Player123 ",
            "club_id": str(club.id),
            "tournament_name": "Grand Knockout Main Bounty",
            "place": 1,
            "prize_amount": "320000",
            "currency_code": "rub",
        },
    )
    assert created.status_code == 201, created.text
    win = created.json()
    assert win["player_nickname"] == "Player123"
    assert win["currency_symbol"] == "₽"
    assert win["club"]["name"] == "Ginger+"

    # Игрок без согласия на публикацию — в ленте анонимно (вопрос 11.18).
    user = User(email="shy@example.com", nickname="shy")
    db_session.add(user)
    await db_session.flush()
    shy = Player(user_id=user.id, results_consent=False)
    db_session.add(shy)
    await db_session.flush()
    db_session.add(
        PlayerWin(
            player_id=shy.id,
            player_nickname="ShyShark",
            tournament_name="Daily",
            prize_amount=Decimal("5000"),
            currency_code="RUB",
            won_on=datetime.now(UTC).date(),
        )
    )
    await db_session.flush()

    feed = (await admin_client.get("/api/v1/feed")).json()
    nicknames = [item["player_nickname"] for item in feed["wins"]]
    assert "Player123" in nicknames
    assert ANONYMOUS_NICKNAME in nicknames
    assert "ShyShark" not in nicknames

    # Админ видит настоящий ник.
    admin_list = (await admin_client.get("/api/v1/admin/wins")).json()
    assert "ShyShark" in [item["player_nickname"] for item in admin_list]

    deleted = await admin_client.delete(f"/api/v1/admin/wins/{win['id']}")
    assert deleted.status_code == 204
    left = (await admin_client.get("/api/v1/admin/wins")).json()
    assert win["id"] not in [item["id"] for item in left]


async def test_win_validation_and_player_cannot_add(
    admin_client: AsyncClient,
) -> None:
    bad_currency = await admin_client.post(
        "/api/v1/admin/wins",
        json={
            "player_nickname": "Player123",
            "tournament_name": "Daily",
            "prize_amount": "100",
            "currency_code": "XXX",
        },
    )
    assert bad_currency.status_code == 422
    assert bad_currency.json()["error"]["code"] == "unknown_currency"

    zero = await admin_client.post(
        "/api/v1/admin/wins",
        json={
            "player_nickname": "Player123",
            "tournament_name": "Daily",
            "prize_amount": "0",
            "currency_code": "RUB",
        },
    )
    assert zero.status_code == 422


async def test_player_cannot_manage_wins(user_client: AsyncClient) -> None:
    assert (await user_client.get("/api/v1/admin/wins")).status_code == 403
