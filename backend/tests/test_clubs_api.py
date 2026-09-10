from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.tournaments import Tournament
from app.services.tournaments.queries import DayPeriod, period_of

pytestmark = pytest.mark.integration

NUTS_CSV = (Path(__file__).parent / "fixtures" / "nuts-2026-09-07.csv").read_bytes()


async def _club_id(db_session: AsyncSession, slug: str) -> str:
    club_id = await db_session.scalar(select(Club.id).where(Club.slug == slug))
    assert club_id is not None
    return str(club_id)


async def _import(client: AsyncClient, club_id: str, *, dry_run: bool) -> dict[str, object]:
    response = await client.post(
        f"/api/v1/admin/clubs/{club_id}/templates/import",
        files={"file": ("nuts.csv", NUTS_CSV, "text/csv")},
        data={"dry_run": "true" if dry_run else "false"},
    )
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


async def test_public_clubs_hide_invisible_and_admin_fields(user_client: AsyncClient) -> None:
    response = await user_client.get("/api/v1/clubs")
    assert response.status_code == 200
    clubs = response.json()
    slugs = [item["slug"] for item in clubs]
    assert "ginger" in slugs
    assert "godaddy" not in slugs
    assert "private-g" not in slugs
    assert all("rakeback_note" not in item and "notes" not in item for item in clubs)


async def test_clubs_require_login(client: AsyncClient, seeded_db: None) -> None:
    assert (await client.get("/api/v1/clubs")).status_code == 401
    assert (await client.get("/api/v1/tournaments")).status_code == 401


async def test_player_cannot_touch_admin_clubs(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger")
    assert (await user_client.get("/api/v1/admin/clubs")).status_code == 403
    response = await user_client.patch(f"/api/v1/admin/clubs/{club_id}", json={"name": "x"})
    assert response.status_code == 403


async def test_admin_updates_club_and_rate_must_be_complete(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger-plus")

    half = await admin_client.patch(f"/api/v1/admin/clubs/{club_id}", json={"chip_value": "1"})
    assert half.status_code == 422

    full = await admin_client.patch(
        f"/api/v1/admin/clubs/{club_id}",
        json={"chip_value": "1", "chip_currency_code": "usdt", "app_club_id": "777"},
    )
    assert full.status_code == 200, full.text
    body = full.json()
    assert body["chip_currency_code"] == "USDT"
    assert body["app_club_id"] == "777"
    assert body["organizer_name"] == "Black Sea"


async def test_import_dry_run_changes_nothing(
    editor_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger")
    result = await _import(editor_client, club_id, dry_run=True)

    assert result["dry_run"] is True
    assert result["rows_total"] == 371
    assert result["issues"] == []
    assert result["templates_created"] == result["templates_parsed"]
    assert isinstance(result["tournaments_created"], int) and result["tournaments_created"] > 300
    assert await db_session.scalar(select(func.count()).select_from(Tournament)) == 0


async def test_import_for_union_without_parser(
    editor_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger21")
    response = await editor_client.post(
        f"/api/v1/admin/clubs/{club_id}/templates/import",
        files={"file": ("x.csv", NUTS_CSV, "text/csv")},
        data={"dry_run": "true"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_template_parser"


async def test_import_then_schedule_with_rub_filter(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger")
    result = await _import(admin_client, club_id, dry_run=False)
    assert result["templates_removed"] == 0

    # Повторный импорт того же файла ничего не меняет.
    again = await _import(admin_client, club_id, dry_run=True)
    assert again["templates_created"] == 0
    assert again["tournaments_created"] == 0
    assert again["tournaments_updated"] == 0

    now = datetime.now(UTC)
    window = {"from": now.isoformat(), "to": (now + timedelta(days=1)).isoformat()}

    response = await admin_client.get("/api/v1/tournaments", params=window)
    assert response.status_code == 200
    day = response.json()
    assert len(day) > 30
    # Курс USDT ещё не задан — рублёвый бай-ин неизвестен.
    assert all(item["buyin_rub"] is None for item in day)
    assert [item["starts_at"] for item in day] == sorted(item["starts_at"] for item in day)

    rate = await admin_client.put("/api/v1/admin/rates/USDT", json={"rate_rub": "90"})
    assert rate.status_code == 200, rate.text

    filtered = await admin_client.get(
        "/api/v1/tournaments", params={**window, "buyin_rub_min": "500", "buyin_rub_max": "2000"}
    )
    items = filtered.json()
    assert items
    assert len(items) < len(day)
    for item in items:
        assert Decimal(item["buyin_rub"]) == (Decimal(item["buyin"]) * 90).quantize(Decimal("1"))
        assert Decimal("500") <= Decimal(item["buyin_rub"]) <= Decimal("2000")

    evening = await admin_client.get("/api/v1/tournaments", params={**window, "period": "evening"})
    for item in evening.json():
        assert period_of(datetime.fromisoformat(item["starts_at"])) is DayPeriod.EVENING

    other_app = await admin_client.get("/api/v1/tournaments", params={**window, "app": "xpoker"})
    assert other_app.json() == []


async def test_tournaments_range_limits(user_client: AsyncClient) -> None:
    now = datetime.now(UTC)
    too_long = await user_client.get(
        "/api/v1/tournaments",
        params={"from": now.isoformat(), "to": (now + timedelta(days=30)).isoformat()},
    )
    assert too_long.status_code == 422
    backwards = await user_client.get(
        "/api/v1/tournaments",
        params={"from": now.isoformat(), "to": (now - timedelta(hours=1)).isoformat()},
    )
    assert backwards.status_code == 422


async def test_currencies_for_profile_exclude_usdt(user_client: AsyncClient) -> None:
    response = await user_client.get("/api/v1/currencies")
    codes = [item["code"] for item in response.json()]
    assert "RUB" in codes
    assert "USDT" not in codes
