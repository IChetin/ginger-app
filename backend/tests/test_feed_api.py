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


async def test_feed_is_public_with_majors_and_evening_per_club(
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

    # Сегодня в этих клубах турниров нет — главная показывает Major завтрашнего дня: в каждом
    # клубе крупнейшую гарантию дня (Иван, 27.09). Сателлит не в счёт даже с гарантией.
    majors = {item["club"]["slug"]: item["name"] for item in feed["majors"]}
    assert majors == {"ginger21": "Big Sunday", "private-g": "PG Evening"}
    assert all(item["is_major"] for item in feed["majors"])

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


async def test_manager_publishes_post_and_feed_shows_it(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    club = await _club(db_session, "ginger21")
    created = await admin_client.post(
        "/api/v1/admin/posts",
        json={
            "title": "  Вторник в клубе  ",
            "body": "Сбор в 19:30, старт в 20:00.",
            "link_url": "/tournaments",
            "link_label": "Расписание",
            "club_id": str(club.id),
            "is_pinned": True,
        },
    )
    assert created.status_code == 201, created.text
    post = created.json()
    assert post["title"] == "Вторник в клубе"
    assert post["club"]["name"] == "Ginger21"
    assert post["image_url"] is None

    # Отложенная запись в ленту пока не попадает, закреплённая — идёт первой.
    later = (
        await admin_client.post(
            "/api/v1/admin/posts",
            json={
                "title": "Анонс на потом",
                "published_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
            },
        )
    ).json()
    old = (
        await admin_client.post(
            "/api/v1/admin/posts",
            json={
                "title": "Старое объявление",
                "published_at": (datetime.now(UTC) - timedelta(days=3)).isoformat(),
                "expires_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            },
        )
    ).json()

    feed = (await admin_client.get("/api/v1/feed")).json()
    titles = [item["title"] for item in feed["posts"]]
    assert titles[0] == "Вторник в клубе"
    assert "Анонс на потом" not in titles
    assert "Старое объявление" not in titles

    # Менеджеру видны все записи, включая отложенные и просроченные.
    admin_titles = [
        item["title"] for item in (await admin_client.get("/api/v1/admin/posts")).json()
    ]
    assert {"Анонс на потом", "Старое объявление"} <= set(admin_titles)
    assert later["id"] and old["id"]

    updated = await admin_client.put(
        f"/api/v1/admin/posts/{post['id']}",
        json={"title": "Вторник переносится", "is_pinned": False},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["club"] is None
    assert updated.json()["link_url"] is None

    deleted = await admin_client.delete(f"/api/v1/admin/posts/{post['id']}")
    assert deleted.status_code == 204
    left = [item["id"] for item in (await admin_client.get("/api/v1/admin/posts")).json()]
    assert post["id"] not in left


async def test_post_image_is_public_and_replaced(
    client: AsyncClient, admin_client: AsyncClient
) -> None:
    post = (await admin_client.post("/api/v1/admin/posts", json={"title": "Афиша недели"})).json()

    text_file = await admin_client.post(
        f"/api/v1/admin/posts/{post['id']}/image",
        files={"file": ("grid.txt", b"not an image", "text/plain")},
    )
    assert text_file.status_code == 415

    uploaded = await admin_client.post(
        f"/api/v1/admin/posts/{post['id']}/image",
        files={"file": ("afisha.png", b"\x89PNG\r\n\x1a\nafisha", "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["image_url"] == f"/api/v1/feed/posts/{post['id']}/image"

    # Картинку видит гость: лента — витрина клуба.
    image = await client.get(f"/api/v1/feed/posts/{post['id']}/image")
    assert image.status_code == 200
    assert image.headers["content-type"].startswith("image/png")
    assert image.content.endswith(b"afisha")

    cleared = await admin_client.delete(f"/api/v1/admin/posts/{post['id']}/image")
    assert cleared.status_code == 200
    assert cleared.json()["image_url"] is None
    assert (await client.get(f"/api/v1/feed/posts/{post['id']}/image")).status_code == 404


async def test_post_link_must_stay_inside_the_app(admin_client: AsyncClient) -> None:
    outside = await admin_client.post(
        "/api/v1/admin/posts",
        json={"title": "Промо", "link_url": "https://example.com"},
    )
    assert outside.status_code == 422


async def test_player_cannot_manage_posts(user_client: AsyncClient) -> None:
    assert (await user_client.get("/api/v1/admin/posts")).status_code == 403
    assert (
        await user_client.post("/api/v1/admin/posts", json={"title": "Свой анонс"})
    ).status_code == 403


async def test_autoposts_pick_each_start_or_random_major(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Новости сами (Иван, 27.09): старт из Editor's Pick — запись; нет подборки — Major дня."""
    from app.services.feed import sync_auto_posts
    from app.services.tournaments.queries import list_tournaments

    club = await _club(db_session, "ginger21")
    # «Сейчас» — полдень сегодняшнего дня: тест не зависит от того, когда его запустили.
    now = _at(0, 12)
    big = _tournament(club, "Dream River", _at(0, 18), guarantee=Decimal("300000"))
    small = _tournament(club, "Small Daily", _at(0, 20), guarantee=Decimal("10000"))
    db_session.add_all([big, small])
    await db_session.flush()

    flags = {
        item.name: item.is_major
        for item in await list_tournaments(db_session, starts_from=now, starts_to=_at(1, 0))
    }
    assert flags == {"Dream River": True, "Small Daily": False}

    # Подборки нет — одна запись о Major дня, повторный проход не плодит новых.
    assert await sync_auto_posts(db_session, now=now) == 1
    assert await sync_auto_posts(db_session, now=now) == 0

    picked = await admin_client.post(
        "/api/v1/admin/editor-picks",
        json={
            "club_id": str(club.id),
            "kind": "mtt",
            "match": "small daily",
            "note": "Мягкое поле",
        },
    )
    assert picked.status_code == 201, picked.text
    # Появился старт из подборки — о нём отдельная запись.
    assert await sync_auto_posts(db_session, now=now) == 1

    from app.services.feed import list_posts

    posts = await list_posts(db_session, now=now)
    by_title = {post.title: post for post in posts}
    assert set(by_title) == {"Major дня: Dream River", "★ Small Daily"}
    pick = by_title["★ Small Daily"]
    assert pick.auto_kind == "pick"
    # Новости не исчезают с закрытием регистрации (Иван, 27.09).
    assert pick.expires_at is None
    assert pick.tournament is not None and pick.tournament.id == small.id
    assert pick.body is not None and "20:00 МСК" in pick.body and "Мягкое поле" in pick.body
    # Выходит утром в 10:00 — «сейчас» уже полдень, значит сразу.
    assert pick.published_at == now

    # Удалённая менеджером автозапись снимается с показа и не создаётся снова.
    deleted = await admin_client.delete(f"/api/v1/admin/posts/{pick.id}")
    assert deleted.status_code == 204
    assert await sync_auto_posts(db_session, now=now) == 0
    titles = {post.title for post in await list_posts(db_session, now=now + timedelta(minutes=1))}
    assert titles == {"Major дня: Dream River"}
