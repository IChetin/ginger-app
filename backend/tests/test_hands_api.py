from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.main import app
from app.models.hands import Hand
from app.services.hand_slug import HAND_SLUG_ALPHABET, HAND_SLUG_LENGTH
from tests.conftest import login_as
from tests.test_hand_engine import FOLD_PREFLOP, SAMPLE_HAND

pytestmark = pytest.mark.integration


def _anon_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_hand_crud_public_private_and_views(editor_client: AsyncClient) -> None:
    created = await editor_client.post(
        "/api/v1/hands",
        json={
            "title": "AK на флопе",
            "note": "Стоит ли коллировать ривер?",
            "is_public": True,
            "data": SAMPLE_HAND,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    slug = body["slug"]
    assert len(slug) == 10
    assert body["is_owner"] is True
    assert body["data"]["result"]["pot"] == 114000
    assert body["author"]["nickname"]

    listed = await editor_client.get("/api/v1/hands")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    item = listed.json()["items"][0]
    assert item["preview"]["hero_cards"] == ["As", "Kc"]
    assert "Ks" in item["preview"]["board"]

    search = await editor_client.get("/api/v1/hands", params={"q": "коллировать"})
    assert search.json()["total"] == 1
    empty = await editor_client.get("/api/v1/hands", params={"q": "неттакойзаметки"})
    assert empty.json()["total"] == 0

    async with _anon_client() as guest:
        public = await guest.get(f"/api/v1/hands/{slug}")
        assert public.status_code == 200
        again = await guest.get(f"/api/v1/hands/{slug}")
        assert again.json()["views_count"] == 2

    owner_get = await editor_client.get(f"/api/v1/hands/{slug}")
    assert owner_get.json()["views_count"] == 2

    private = await editor_client.patch(f"/api/v1/hands/{slug}", json={"is_public": False})
    assert private.status_code == 200

    async with _anon_client() as guest:
        hidden = await guest.get(f"/api/v1/hands/{slug}")
        assert hidden.status_code == 404

    settings = get_settings()
    other = _anon_client()
    async with other:
        await login_as(other, settings.seed_admin_email)
        forbidden = await other.get(f"/api/v1/hands/{slug}")
        assert forbidden.status_code == 404

    own = await editor_client.get(f"/api/v1/hands/{slug}")
    assert own.status_code == 200

    deleted = await editor_client.delete(f"/api/v1/hands/{slug}")
    assert deleted.status_code == 204
    gone = await editor_client.get(f"/api/v1/hands/{slug}")
    assert gone.status_code == 404


async def test_hand_validation_rejects_bad_data(editor_client: AsyncClient) -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["seats"][0]["cards"] = ["As", "As"]  # type: ignore[index]
    response = await editor_client.post("/api/v1/hands", json={"data": payload})
    assert response.status_code == 422

    fold = await editor_client.post(
        "/api/v1/hands",
        json={"data": FOLD_PREFLOP, "is_public": True},
    )
    assert fold.status_code == 201, fold.text
    assert fold.json()["data"]["streets"][0]["street"] == "preflop"


async def test_hand_rejects_zero_stack(editor_client: AsyncClient) -> None:
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["seats"][0]["stack"] = 0  # type: ignore[index]
    response = await editor_client.post("/api/v1/hands", json={"data": payload})
    assert response.status_code == 422
    assert "больше нуля" in response.text


async def test_hands_require_auth_for_write(client: AsyncClient) -> None:
    response = await client.post("/api/v1/hands", json={"data": SAMPLE_HAND})
    assert response.status_code == 401
    listed = await client.get("/api/v1/hands")
    assert listed.status_code == 401


async def test_hand_spa_og_meta_and_private_404(editor_client: AsyncClient) -> None:
    created = await editor_client.post(
        "/api/v1/hands",
        json={"data": SAMPLE_HAND, "is_public": True, "note": "Тестовая раздача"},
    )
    assert created.status_code == 201, created.text
    slug = created.json()["slug"]
    page = await editor_client.get(f"/hand/{slug}")
    assert page.status_code == 200
    html = page.text
    assert 'property="og:title"' in html
    assert "AKo на" in html
    assert "банк 114 000" in html
    assert 'property="og:image"' in html
    assert f"/api/v1/hands/{slug}/og.png?v=" in html
    assert 'twitter:card" content="summary_large_image"' in html
    assert "Раздача · Day2" not in html

    new_page = await editor_client.get("/hand/new")
    assert new_page.status_code == 200
    missing = await editor_client.get("/hand/noSuchSlug")
    assert missing.status_code == 200
    assert 'property="og:title"' not in missing.text
    async with _anon_client() as guest:
        assert (await guest.get("/hand/noSuchSlug")).status_code == 404

    await editor_client.patch(f"/api/v1/hands/{slug}", json={"is_public": False})
    async with _anon_client() as guest:
        hidden = await guest.get(f"/hand/{slug}")
        assert hidden.status_code == 404
        hidden_png = await guest.get(f"/api/v1/hands/{slug}/og.png")
        assert hidden_png.status_code == 404


async def test_hand_og_png_public(editor_client: AsyncClient) -> None:
    created = await editor_client.post(
        "/api/v1/hands",
        json={"data": SAMPLE_HAND, "is_public": True},
    )
    assert created.status_code == 201, created.text
    slug = created.json()["slug"]
    first = await editor_client.get(f"/api/v1/hands/{slug}/og.png")
    assert first.status_code == 200
    assert first.headers["content-type"].startswith("image/png")
    assert first.content[:8] == b"\x89PNG\r\n\x1a\n"
    second = await editor_client.get(f"/api/v1/hands/{slug}/og.png")
    assert second.status_code == 200
    assert second.headers.get("x-share-cache") == "HIT"


async def test_list_and_get_tolerate_legacy_pot(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    me = await editor_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    payload = copy.deepcopy(SAMPLE_HAND)
    payload["result"]["pot"] = 104000  # type: ignore[index]
    payload["result"]["hero_profit"] = 55500  # type: ignore[index]
    created = await editor_client.post("/api/v1/hands", json={"data": payload})
    assert created.status_code == 201, created.text
    assert created.json()["data"]["result"]["pot"] == 114000

    db_session.add(
        Hand(
            user_id=UUID(me.json()["id"]),
            slug="legacypot1",
            data=payload,
            is_public=True,
            title="Старый банк",
        )
    )
    await db_session.flush()

    listed = await editor_client.get("/api/v1/hands")
    assert listed.status_code == 200, listed.text
    item = next(row for row in listed.json()["items"] if row["slug"] == "legacypot1")
    assert item["preview"]["pot"] == 104000

    got = await editor_client.get("/api/v1/hands/legacypot1")
    assert got.status_code == 200, got.text
    assert got.json()["data"]["result"]["pot"] == 104000


def _wizard(step: int = 1, **overrides: object) -> dict:
    body: dict = {"step": step, "furthestStep": step, "heroCards": [], "streets": []}
    body.update(overrides)
    return body


async def test_hand_draft_crud_publish_and_limit(editor_client: AsyncClient) -> None:
    from uuid import uuid4

    draft_id = str(uuid4())
    created = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": draft_id, "current_step": 2, "wizard": _wizard(2, heroCards=["As", "Kd"])},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    slug = body["slug"]
    assert body["id"] == draft_id
    assert body["status"] == "draft"
    assert isinstance(slug, str)
    assert len(slug) == HAND_SLUG_LENGTH
    assert all(ch in HAND_SLUG_ALPHABET for ch in slug)
    assert body["is_public"] is False
    assert body["current_step"] == 2
    assert body["wizard"]["heroCards"] == ["As", "Kd"]
    assert body["data"] is None

    again = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": draft_id, "current_step": 1, "wizard": _wizard(1)},
    )
    assert again.status_code == 200
    assert again.json()["current_step"] == 2

    listed = await editor_client.get("/api/v1/hands", params={"status": "draft"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    item = listed.json()["items"][0]
    assert item["status"] == "draft"
    assert item["slug"] == slug
    assert item["preview"]["hero_cards"] == ["As", "Kd"]

    patched = await editor_client.patch(
        f"/api/v1/hands/{draft_id}",
        json={
            "current_step": 3,
            "wizard": _wizard(
                3,
                heroCards=["As", "Kd"],
                streets=[{"street": "preflop", "board": []}],
            ),
            "base_updated_at": body["updated_at"],
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["current_step"] == 3
    assert patched.json()["current_street"] == "preflop"

    stale = await editor_client.patch(
        f"/api/v1/hands/{draft_id}",
        json={
            "current_step": 4,
            "wizard": _wizard(4, heroCards=["Qs", "Qh"]),
            "base_updated_at": body["updated_at"],
        },
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "draft_conflict"
    assert stale.json()["error"]["server"]["current_step"] == 3

    async with _anon_client() as guest:
        hidden = await guest.get(f"/api/v1/hands/{draft_id}")
        assert hidden.status_code == 404
        hidden_slug = await guest.get(f"/api/v1/hands/{slug}")
        assert hidden_slug.status_code == 404
        hidden_page = await guest.get(f"/hand/{slug}")
        assert hidden_page.status_code == 404
        hidden_legacy = await guest.get(f"/hand/draft/{draft_id}")
        assert hidden_legacy.status_code == 404

    owner_get = await editor_client.get(f"/api/v1/hands/{slug}")
    assert owner_get.status_code == 200
    assert owner_get.json()["status"] == "draft"
    owner_page = await editor_client.get(f"/hand/{slug}")
    assert owner_page.status_code == 200
    assert 'property="og:title"' not in owner_page.text
    legacy = await editor_client.get(f"/hand/draft/{draft_id}", follow_redirects=False)
    assert legacy.status_code == 301
    assert legacy.headers["location"] == f"/hand/{slug}"

    published = await editor_client.post(
        f"/api/v1/hands/{draft_id}/publish",
        json={"data": SAMPLE_HAND, "is_public": True, "note": "с черновика"},
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"
    assert published.json()["slug"] == slug
    assert published.json()["data"]["result"]["pot"] == 114000
    assert published.json()["wizard"] is None

    gone = await editor_client.get("/api/v1/hands", params={"status": "draft"})
    assert gone.json()["total"] == 0


async def test_hand_draft_accepts_client_slug(editor_client: AsyncClient) -> None:
    from uuid import uuid4

    draft_id = str(uuid4())
    slug = "Ab3Cd4Ef5G"
    created = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": draft_id, "slug": slug, "current_step": 1, "wizard": _wizard(1)},
    )
    assert created.status_code == 201, created.text
    assert created.json()["slug"] == slug

    taken = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": str(uuid4()), "slug": slug, "current_step": 1, "wizard": _wizard(1)},
    )
    assert taken.status_code == 409
    assert taken.json()["error"]["code"] == "slug_taken"

    invalid = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": str(uuid4()), "slug": "bad-slug!!", "current_step": 1, "wizard": _wizard(1)},
    )
    assert invalid.status_code == 422


async def test_hand_draft_limit_and_delete(editor_client: AsyncClient) -> None:
    from uuid import uuid4

    ids = [str(uuid4()) for _ in range(20)]
    for draft_id in ids:
        created = await editor_client.post(
            "/api/v1/hands/draft",
            json={"id": draft_id, "current_step": 1, "wizard": _wizard(1)},
        )
        assert created.status_code == 201, created.text
    extra = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": str(uuid4()), "current_step": 1, "wizard": _wizard(1)},
    )
    assert extra.status_code == 409
    assert extra.json()["error"]["code"] == "draft_limit"

    deleted = await editor_client.delete(f"/api/v1/hands/{ids[0]}")
    assert deleted.status_code == 204
    created = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": str(uuid4()), "current_step": 1, "wizard": _wizard(1)},
    )
    assert created.status_code == 201, created.text


async def test_hand_list_orders_newest_first(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    old_draft_id = str(uuid4())
    old_draft = await editor_client.post(
        "/api/v1/hands/draft",
        json={
            "id": old_draft_id,
            "current_step": 3,
            "wizard": _wizard(3, heroCards=["2c", "2h"]),
        },
    )
    assert old_draft.status_code == 201, old_draft.text
    published = await editor_client.post("/api/v1/hands", json={"data": SAMPLE_HAND})
    assert published.status_code == 201, published.text
    newer_draft_id = str(uuid4())
    newer_draft = await editor_client.post(
        "/api/v1/hands/draft",
        json={
            "id": newer_draft_id,
            "current_step": 3,
            "wizard": _wizard(3, heroCards=["As", "Kd"]),
        },
    )
    assert newer_draft.status_code == 201, newer_draft.text

    published_id = published.json()["id"]
    old_at = datetime(2026, 8, 19, 20, 48, tzinfo=UTC)
    published_at = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
    newer_draft_at = datetime(2026, 8, 23, 19, 30, tzinfo=UTC)
    await db_session.execute(
        update(Hand)
        .where(Hand.id == UUID(old_draft_id))
        .values(created_at=old_at, updated_at=old_at)
    )
    await db_session.execute(
        update(Hand)
        .where(Hand.id == UUID(published_id))
        .values(created_at=published_at, updated_at=published_at)
    )
    await db_session.execute(
        update(Hand)
        .where(Hand.id == UUID(newer_draft_id))
        .values(created_at=newer_draft_at - timedelta(days=1), updated_at=newer_draft_at)
    )
    await db_session.flush()

    listed = await editor_client.get("/api/v1/hands")
    ids = [item["id"] for item in listed.json()["items"]]
    assert ids[:3] == [published_id, newer_draft_id, old_draft_id]


async def test_hand_list_drops_empty_drafts(editor_client: AsyncClient) -> None:
    empty_id = str(uuid4())
    empty = await editor_client.post(
        "/api/v1/hands/draft",
        json={"id": empty_id, "current_step": 1, "wizard": _wizard(1)},
    )
    assert empty.status_code == 201, empty.text
    kept_id = str(uuid4())
    kept = await editor_client.post(
        "/api/v1/hands/draft",
        json={
            "id": kept_id,
            "current_step": 3,
            "wizard": _wizard(
                3,
                heroCards=["As", "Kd"],
                streets=[
                    {
                        "street": "preflop",
                        "board": [],
                        "actions": [{"seat": 1, "action": "fold"}],
                    }
                ],
            ),
        },
    )
    assert kept.status_code == 201, kept.text
    listed = await editor_client.get("/api/v1/hands", params={"status": "draft"})
    ids = [item["id"] for item in listed.json()["items"]]
    assert kept_id in ids
    assert empty_id not in ids
    still_there = await editor_client.get(f"/api/v1/hands/{empty_id}")
    assert still_there.status_code == 200, still_there.text


async def test_opponent_names_ranked_and_replay_rename(editor_client: AsyncClient) -> None:
    from uuid import uuid4

    first = copy.deepcopy(SAMPLE_HAND)
    first["seats"][1]["name"] = "Рег из Минска"  # type: ignore[index]
    first["seats"][2]["name"] = "Ник"  # type: ignore[index]
    created = await editor_client.post("/api/v1/hands", json={"data": first})
    assert created.status_code == 201, created.text
    slug = created.json()["slug"]

    second = copy.deepcopy(SAMPLE_HAND)
    second["seats"][1]["name"] = "Рег из Минска"  # type: ignore[index]
    await editor_client.post("/api/v1/hands", json={"data": second})

    draft_id = str(uuid4())
    await editor_client.post(
        "/api/v1/hands/draft",
        json={
            "id": draft_id,
            "current_step": 1,
            "wizard": _wizard(1, names={"4": "Дед в кепке"}),
        },
    )

    names = await editor_client.get("/api/v1/hands/opponent-names")
    assert names.status_code == 200, names.text
    assert names.json()[0] == "Рег из Минска"
    assert "Ник" in names.json()
    assert "Дед в кепке" in names.json()
    assert "Игрок 7" not in names.json()
    assert "Вы" not in names.json()

    patched = copy.deepcopy(first)
    patched["seats"][1]["name"] = "Короткий ник"  # type: ignore[index]
    renamed = await editor_client.patch(f"/api/v1/hands/{slug}", json={"data": patched})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["seats"][1]["name"] == "Короткий ник"

    hero_try = copy.deepcopy(first)
    hero_try["seats"][0]["name"] = "Не я"  # type: ignore[index]
    forced = await editor_client.patch(f"/api/v1/hands/{slug}", json={"data": hero_try})
    assert forced.status_code == 200, forced.text
    assert forced.json()["data"]["seats"][0]["name"] == "Вы"

    too_long = copy.deepcopy(first)
    too_long["seats"][1]["name"] = "Этот ник явно длиннее шестнадцати"  # type: ignore[index]
    rejected = await editor_client.patch(f"/api/v1/hands/{slug}", json={"data": too_long})
    assert rejected.status_code == 422

    async with _anon_client() as guest:
        public = await guest.get(f"/api/v1/hands/{slug}")
        assert public.status_code == 200
        steal = await guest.patch(
            f"/api/v1/hands/{slug}",
            json={"data": patched},
        )
        assert steal.status_code in {401, 403}


async def test_hand_link_targets_sections_and_series_bind(
    editor_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import UTC, date, datetime, timedelta
    from decimal import Decimal

    from sqlalchemy import select

    from app.core.config import get_settings
    from app.models.auth import User
    from app.models.enums import EventStatus, GameType, LiveSessionStatus, SeriesStatus
    from app.models.live import LiveSession
    from app.models.schedule import Event, Flight, Series
    from tests.conftest import seed_organizer_id, seed_venue_id

    settings = get_settings()
    user = await db_session.scalar(select(User).where(User.email == settings.seed_editor_email))
    assert user is not None
    today = date.today()
    suffix = uuid4().hex[:8]
    running = Series(
        organizer_id=seed_organizer_id(),
        venue_id=seed_venue_id(),
        name=f"Идущая серия {suffix}",
        slug=f"running-{suffix}",
        starts_on=today - timedelta(days=1),
        ends_on=today + timedelta(days=5),
        status=SeriesStatus.RUNNING,
    )
    finished = Series(
        organizer_id=seed_organizer_id(),
        venue_id=seed_venue_id(),
        name=f"Архивная серия {suffix}",
        slug=f"finished-{suffix}",
        starts_on=today - timedelta(days=20),
        ends_on=today - timedelta(days=10),
        status=SeriesStatus.FINISHED,
    )
    db_session.add_all([running, finished])
    await db_session.flush()

    today_event = Event(
        series_id=running.id,
        number=1,
        name=f"Сегодняшний турнир {suffix}",
        slug=f"today-{suffix}",
        buyin=Decimal("11000"),
        currency_code="RUB",
        game_type=GameType.NLH,
        status=EventStatus.SCHEDULED,
    )
    later_event = Event(
        series_id=running.id,
        number=2,
        name=f"Завтрашний турнир {suffix}",
        slug=f"later-{suffix}",
        buyin=Decimal("22000"),
        currency_code="RUB",
        game_type=GameType.NLH,
        status=EventStatus.SCHEDULED,
    )
    archive_event = Event(
        series_id=finished.id,
        number=1,
        name=f"Старый мейн {suffix}",
        slug=f"old-{suffix}",
        buyin=Decimal("33000"),
        currency_code="RUB",
        game_type=GameType.NLH,
        status=EventStatus.SCHEDULED,
    )
    db_session.add_all([today_event, later_event, archive_event])
    await db_session.flush()
    db_session.add_all(
        [
            Flight(event_id=today_event.id, start_at=datetime.now(UTC)),
            Flight(event_id=later_event.id, start_at=datetime.now(UTC) + timedelta(days=2)),
            Flight(event_id=archive_event.id, start_at=datetime.now(UTC) - timedelta(days=15)),
        ]
    )
    db_session.add(
        LiveSession(
            user_id=user.id,
            event_id=today_event.id,
            started_at=datetime.now(UTC),
            status=LiveSessionStatus.ACTIVE,
        )
    )
    await db_session.flush()

    listed = await editor_client.get("/api/v1/hands/link-targets")
    assert listed.status_code == 200, listed.text
    items = listed.json()
    kinds = [item["kind"] for item in items]
    sections = [item["section"] for item in items]
    assert kinds[0] == "live"
    assert sections[0] == "live"
    assert items[0]["event_id"] == str(today_event.id)
    assert any(
        item["kind"] == "series"
        and item["section"] == "running"
        and item["series_id"] == str(running.id)
        for item in items
    )
    assert any(
        item["kind"] == "event"
        and item["section"] == "running"
        and item["event_id"] == str(later_event.id)
        for item in items
    )
    assert all(item["event_id"] != str(archive_event.id) for item in items)
    assert all(item.get("series_id") != str(finished.id) for item in items)
    live_idx = next(i for i, item in enumerate(items) if item["kind"] == "live")
    today_idxs = [i for i, item in enumerate(items) if item["section"] == "today"]
    running_idxs = [i for i, item in enumerate(items) if item["section"] == "running"]
    assert all(live_idx < idx for idx in today_idxs + running_idxs)
    if today_idxs and running_idxs:
        assert max(today_idxs) < min(running_idxs)

    searched = await editor_client.get(
        "/api/v1/hands/link-targets",
        params={"q": f"Старый мейн {suffix}"},
    )
    assert searched.status_code == 200, searched.text
    assert any(
        item["section"] == "search" and item["event_id"] == str(archive_event.id)
        for item in searched.json()
    )

    both = await editor_client.post(
        "/api/v1/hands",
        json={
            "event_id": str(today_event.id),
            "series_id": str(running.id),
            "data": SAMPLE_HAND,
        },
    )
    assert both.status_code == 422

    created = await editor_client.post(
        "/api/v1/hands",
        json={"series_id": str(running.id), "data": SAMPLE_HAND},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["series_id"] == str(running.id)
    assert body["event_id"] is None
    assert body["series"]["name"] == running.name

    listed_hands = await editor_client.get("/api/v1/hands")
    assert listed_hands.status_code == 200
    assert listed_hands.json()["items"][0]["series"]["id"] == str(running.id)
