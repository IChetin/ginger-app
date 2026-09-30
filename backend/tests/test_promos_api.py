"""Акции плашками (Иван, 30.09): черновик из текста или картинки → публикация → витрина."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.promos import Promotion
from app.services import ocr
from app.services.promos import renew_monthly

UNION_POST = """⚡️ С 1 октября в союзе «Просторы покера» стартует новый месячный LEADERBOARD!
🥇 1 место — 50 000 ₽
🥈 2 место — 40 000 ₽
3 место — 🖤 Black VIP Card
"""


async def _club_id(db_session: AsyncSession, slug: str) -> str:
    club = await db_session.scalar(select(Club).where(Club.slug == slug))
    assert club is not None
    return str(club.id)


def _payload(club_id: str | None, **changes: object) -> dict[str, object]:
    now = datetime.now(UTC)
    body: dict[str, object] = {
        "club_id": club_id,
        "kind": "leaderboard",
        "title": "Leaderboard MTT",
        "prize_fund": "610000",
        "currency_code": "RUB",
        "starts_at": (now - timedelta(days=2)).isoformat(),
        "ends_at": (now + timedelta(days=30)).isoformat(),
        "buyin_min": "500",
        "buyin_max": "10000",
        "prizes": [{"place": 1, "amount": "250000"}, {"place": 2, "label": "Black VIP Card"}],
        "boost_windows": [{"start": "10:00", "end": "12:00"}],
        "is_published": True,
    }
    body.update(changes)
    return body


async def test_union_post_becomes_draft_of_our_club_then_published(
    client: AsyncClient, admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    created = await admin_client.post("/api/v1/admin/promos/from-text", json={"text": UNION_POST})
    assert created.status_code == 201, created.text
    draft = created.json()

    # Игрок видит клуб, а не союз: «Просторы покера» — наш Private.G.
    assert draft["club"]["name"] == "Private.G"
    assert draft["is_published"] is False
    assert draft["recurrence"] == "monthly"
    assert [prize["place"] for prize in draft["prizes"]] == [1, 2, 3]
    assert draft["prizes"][2]["label"] == "Black VIP Card"
    assert "title" in draft["uncertain"]
    # Черновик на витрину не попадает.
    assert (await client.get("/api/v1/promos")).json() == []

    body = {
        key: draft[key]
        for key in (
            "kind",
            "title",
            "prize_fund",
            "prize_extra",
            "currency_code",
            "recurrence",
            "game",
            "buyin_min",
            "buyin_max",
            "prizes",
            "boost_windows",
        )
    }
    now = datetime.now(UTC)
    body |= {
        "club_id": draft["club"]["id"],
        "starts_at": (now + timedelta(days=1)).isoformat(),
        "ends_at": (now + timedelta(days=31)).isoformat(),
        "uncertain": [],
        "is_published": True,
    }
    published = await admin_client.put(f"/api/v1/admin/promos/{draft['id']}", json=body)
    assert published.status_code == 200, published.text

    # Витрина открыта и гостю; анонс за день до старта уже виден.
    await admin_client.post("/api/v1/auth/logout")
    public = (await client.get("/api/v1/promos")).json()
    assert [item["title"] for item in public] == [draft["title"]]
    assert public[0]["club"]["name"] == "Private.G"
    assert public[0]["currency_symbol"] == "₽"
    assert "uncertain" not in public[0]


async def test_ended_promo_disappears_and_running_ones_go_first(
    client: AsyncClient, admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    ginger21 = await _club_id(db_session, "ginger21")
    now = datetime.now(UTC)
    small = _payload(ginger21, title="МТТ Мини Чемп", prize_fund="90000")
    big = _payload(ginger21, title="Leaderboard MTT", prize_fund="610000")
    ended = _payload(
        ginger21,
        title="Прошлый месяц",
        starts_at=(now - timedelta(days=40)).isoformat(),
        ends_at=(now - timedelta(minutes=1)).isoformat(),
    )
    far = _payload(
        ginger21,
        title="Через месяц",
        starts_at=(now + timedelta(days=30)).isoformat(),
        ends_at=(now + timedelta(days=60)).isoformat(),
    )
    soon = _payload(
        ginger21,
        title="Завтра",
        starts_at=(now + timedelta(days=1)).isoformat(),
        ends_at=(now + timedelta(days=10)).isoformat(),
    )
    for body in (small, big, ended, far, soon):
        response = await admin_client.post("/api/v1/admin/promos", json=body)
        assert response.status_code == 201, response.text

    titles = [item["title"] for item in (await client.get("/api/v1/promos")).json()]
    # Идущие — по фонду, потом ближайший анонс; закончившейся и далёкой нет.
    assert titles == ["Leaderboard MTT", "МТТ Мини Чемп", "Завтра"]


async def test_publishing_needs_club_and_dates(admin_client: AsyncClient) -> None:
    no_club = await admin_client.post("/api/v1/admin/promos", json=_payload(None))
    assert no_club.status_code == 422

    backwards = _payload(None, is_published=False)
    backwards["ends_at"] = backwards["starts_at"]
    assert (await admin_client.post("/api/v1/admin/promos", json=backwards)).status_code == 422

    draft = await admin_client.post("/api/v1/admin/promos", json=_payload(None, is_published=False))
    assert draft.status_code == 201, draft.text


async def test_monthly_promo_leaves_draft_for_next_month_once(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    private_g = await _club_id(db_session, "private-g")
    now = datetime.now(UTC)
    body = _payload(
        private_g,
        recurrence="monthly",
        starts_at=(now - timedelta(days=31)).isoformat(),
        ends_at=(now - timedelta(hours=1)).isoformat(),
    )
    created = (await admin_client.post("/api/v1/admin/promos", json=body)).json()

    assert await renew_monthly(db_session) == 1
    assert await renew_monthly(db_session) == 0

    drafts = [
        item
        for item in (await admin_client.get("/api/v1/admin/promos")).json()
        if item["renewed_from_id"] == created["id"]
    ]
    assert len(drafts) == 1
    assert drafts[0]["is_published"] is False
    assert drafts[0]["starts_at"] == created["ends_at"]
    assert drafts[0]["prizes"] == created["prizes"]
    assert "prizes" in drafts[0]["uncertain"]


async def test_image_draft_keeps_poster_and_parses_ocr_text(
    client: AsyncClient, admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_ocr(_data: bytes) -> str:
        return "POKER21 PLUS\nLEADERBOARD MTT\nПризовой фонд 610 000 ₽\n1 — 250 000 ₽\n"

    monkeypatch.setattr(ocr, "image_to_text", fake_ocr)
    response = await admin_client.post(
        "/api/v1/admin/promos/from-image",
        files={"file": ("poster.png", b"\x89PNG\r\n\x1a\nposter", "image/png")},
    )
    assert response.status_code == 201, response.text
    draft = response.json()
    assert draft["club"]["name"] == "Ginger21"
    assert draft["prize_fund"] == "610000.00"
    assert draft["source_text"].startswith("POKER21 PLUS")

    image = await client.get(draft["image_url"])
    assert image.status_code == 200
    assert image.content.endswith(b"poster")

    deleted = await admin_client.delete(f"/api/v1/admin/promos/{draft['id']}")
    assert deleted.status_code == 204
    assert (await client.get(draft["image_url"])).status_code == 404


async def test_player_cannot_manage_promos(user_client: AsyncClient) -> None:
    assert (await user_client.get("/api/v1/admin/promos")).status_code == 403
    response = await user_client.post("/api/v1/admin/promos/from-text", json={"text": UNION_POST})
    assert response.status_code == 403


async def test_promo_is_removed_with_its_club(db_session: AsyncSession) -> None:
    """Каскад: клуб удалили — его акции тоже (игрок не видит акцию без клуба)."""
    from sqlalchemy import delete

    club = Club(name="Временный", slug="tmp-club", app="pppoker")
    db_session.add(club)
    await db_session.flush()
    promo = Promotion(club_id=club.id, title="Акция")
    db_session.add(promo)
    await db_session.flush()
    promo_id = promo.id
    db_session.expunge(promo)
    await db_session.execute(delete(Club).where(Club.id == club.id))
    assert await db_session.scalar(select(Promotion.id).where(Promotion.id == promo_id)) is None
