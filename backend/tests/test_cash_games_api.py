from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.cash import CashGame

pytestmark = pytest.mark.integration

TOKEN = "collector-test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def _game(**overrides: object) -> dict[str, object]:
    return {"game_type": "nlh", "small_blind": "0.1", "big_blind": "0.2", "tables": 3, **overrides}


async def test_cash_snapshot_updates_limits_and_closes_missing(
    admin_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "collector_token", TOKEN)

    mtt = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "mtt", "app": "pppoker"}, headers=AUTH
    )
    wrong_kind = await admin_client.post(
        f"/api/v1/collector/runs/{mtt.json()['id']}/cash",
        headers=AUTH,
        json={"club_slug": "ginger", "games": [_game()]},
    )
    assert wrong_kind.status_code == 422

    run = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "cash", "app": "pppoker"}, headers=AUTH
    )
    url = f"/api/v1/collector/runs/{run.json()['id']}/cash"

    first = await admin_client.post(
        url,
        headers=AUTH,
        json={
            "club_slug": "ginger",
            "games": [
                _game(app_link="https://pppoker.club/table/a"),
                _game(game_type="plo5", small_blind="1", big_blind="2", tables=1),
            ],
        },
    )
    assert first.status_code == 200, first.text
    assert first.json() == {"added": 2, "updated": 0, "closed": 0}

    # Тот же лимит, записанный иначе («0.10»), — та же строка; PLO5 закрылся.
    second = await admin_client.post(
        url,
        headers=AUTH,
        json={"club_slug": "ginger", "games": [_game(small_blind="0.10", tables=5)]},
    )
    assert second.json() == {"added": 0, "updated": 1, "closed": 1}

    listed = (await admin_client.get("/api/v1/cash-games")).json()
    assert [(item["game_type"], item["tables"]) for item in listed] == [("nlh", 5)]
    assert listed[0]["club"]["slug"] == "ginger"
    # Пустая ссылка во втором проходе известную не стёрла.
    assert listed[0]["app_link"] == "https://pppoker.club/table/a"
    assert listed[0]["is_editor_pick"] is False

    # Сборщик замолчал — устаревший лимит игроку не показываем.
    game = await db_session.scalar(select(CashGame))
    assert game is not None
    game.seen_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()
    assert (await admin_client.get("/api/v1/cash-games")).json() == []


async def test_cash_snapshot_rejects_bad_payload(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "collector_token", TOKEN)
    run = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "cash", "app": "pppoker"}, headers=AUTH
    )
    url = f"/api/v1/collector/runs/{run.json()['id']}/cash"

    duplicate = await admin_client.post(
        url, headers=AUTH, json={"club_slug": "ginger", "games": [_game(), _game(tables=1)]}
    )
    assert duplicate.status_code == 422

    bad_link = await admin_client.post(
        url,
        headers=AUTH,
        json={"club_slug": "ginger", "games": [_game(app_link="javascript:alert(1)")]},
    )
    assert bad_link.status_code == 422

    other_app = await admin_client.post(
        url, headers=AUTH, json={"club_slug": "ginger-plus", "games": [_game()]}
    )
    assert other_app.status_code == 422
