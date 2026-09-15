from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.cash import CashTable

pytestmark = pytest.mark.integration

TOKEN = "collector-test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def _table(key: str, **overrides: object) -> dict[str, object]:
    return {
        "table_key": key,
        "name": f"NLH {key}",
        "game_type": "nlh",
        "small_blind": "0.1",
        "big_blind": "0.2",
        "table_size": 6,
        "seated": 4,
        "min_buyin": "20",
        **overrides,
    }


async def test_cash_snapshot_updates_tables_and_closes_missing(
    admin_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "collector_token", TOKEN)

    mtt = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "mtt", "app": "pppoker"}, headers=AUTH
    )
    wrong_kind = await admin_client.post(
        f"/api/v1/collector/runs/{mtt.json()['id']}/cash",
        headers=AUTH,
        json={"club_slug": "ginger", "tables": [_table("a")]},
    )
    assert wrong_kind.status_code == 422

    run = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "cash", "app": "pppoker"}, headers=AUTH
    )
    run_id = run.json()["id"]

    first = await admin_client.post(
        f"/api/v1/collector/runs/{run_id}/cash",
        headers=AUTH,
        json={
            "club_slug": "ginger",
            "tables": [
                _table("a", app_link="https://pppoker.club/table/a"),
                _table("b", game_type="plo5", small_blind="1", big_blind="2"),
            ],
        },
    )
    assert first.status_code == 200, first.text
    assert first.json() == {"added": 2, "updated": 0, "closed": 0}

    second = await admin_client.post(
        f"/api/v1/collector/runs/{run_id}/cash",
        headers=AUTH,
        json={"club_slug": "ginger", "tables": [_table("a", seated=6, waiting=2)]},
    )
    assert second.json() == {"added": 0, "updated": 1, "closed": 1}

    listed = (await admin_client.get("/api/v1/cash-tables")).json()
    assert [(item["name"], item["seated"], item["waiting"]) for item in listed] == [("NLH a", 6, 2)]
    assert listed[0]["club"]["slug"] == "ginger"
    assert listed[0]["app_link"] == "https://pppoker.club/table/a"

    # Сборщик замолчал — устаревший стол игроку не показываем.
    table = await db_session.scalar(select(CashTable).where(CashTable.table_key == "a"))
    assert table is not None
    table.seen_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()
    assert (await admin_client.get("/api/v1/cash-tables")).json() == []


async def test_cash_snapshot_rejects_bad_payload(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "collector_token", TOKEN)
    run = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "cash", "app": "pppoker"}, headers=AUTH
    )
    url = f"/api/v1/collector/runs/{run.json()['id']}/cash"

    duplicate = await admin_client.post(
        url, headers=AUTH, json={"club_slug": "ginger", "tables": [_table("a"), _table("a")]}
    )
    assert duplicate.status_code == 422

    bad_link = await admin_client.post(
        url,
        headers=AUTH,
        json={"club_slug": "ginger", "tables": [_table("a", app_link="javascript:alert(1)")]},
    )
    assert bad_link.status_code == 422

    other_app = await admin_client.post(
        url, headers=AUTH, json={"club_slug": "ginger-plus", "tables": [_table("a")]}
    )
    assert other_app.status_code == 422
