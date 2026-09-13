from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.references import FxRate
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
    assert "private-g" in slugs
    assert "siniy-apelsin" not in slugs
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
    club_id = await _club_id(db_session, "godaddy")

    # У GoDaddy! курса нет: валюта без значения — половинка курса.
    half = await admin_client.patch(
        f"/api/v1/admin/clubs/{club_id}", json={"chip_currency_code": "RUB"}
    )
    assert half.status_code == 422

    full = await admin_client.patch(
        f"/api/v1/admin/clubs/{club_id}",
        json={"chip_value": "1", "chip_currency_code": "usdt", "app_club_id": "777"},
    )
    assert full.status_code == 200, full.text
    body = full.json()
    assert body["chip_currency_code"] == "USDT"
    assert body["app_club_id"] == "777"
    assert body["organizer_name"] is None


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


async def test_running_tournament_shown_while_late_reg_open(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger")
    now = datetime.now(UTC)
    common = {"club_id": club_id, "buyin": Decimal("8")}
    db_session.add_all(
        [
            Tournament(
                name="OPEN",
                starts_at=now - timedelta(minutes=30),
                late_reg_closes_at=now + timedelta(minutes=47),
                **common,
            ),
            Tournament(
                name="CLOSED",
                starts_at=now - timedelta(hours=3),
                late_reg_closes_at=now - timedelta(minutes=5),
                **common,
            ),
            Tournament(name="NO LATE REG", starts_at=now - timedelta(minutes=10), **common),
        ]
    )
    await db_session.flush()

    response = await user_client.get("/api/v1/tournaments")
    names = [item["name"] for item in response.json()]
    assert names == ["OPEN"]
    (item,) = response.json()
    assert item["club"]["currency_symbol"] == "$"


async def test_profile_schedule_view(user_client: AsyncClient) -> None:
    assert (await user_client.get("/api/v1/auth/me")).json()["schedule_view"] == "cards"
    updated = await user_client.patch("/api/v1/auth/me", json={"schedule_view": "table"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["schedule_view"] == "table"
    wrong = await user_client.patch("/api/v1/auth/me", json={"schedule_view": "grid"})
    assert wrong.status_code == 422


async def test_highlights_are_top_guarantees_per_day_without_login(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ginger = await _club_id(db_session, "ginger")  # 1 фишка = 1 USDT
    ginger21 = await _club_id(db_session, "ginger21")  # 1 фишка = 1 ₽
    db_session.add(FxRate(currency_code="USDT", rate_date=datetime.now(UTC).date(), rate_rub=88))
    start = datetime.now(UTC).replace(microsecond=0) + timedelta(hours=1)
    rows = [
        (ginger, "USDT 1000", Decimal("1000")),  # 88 000 ₽
        (ginger21, "RUB 50000", Decimal("50000")),  # 50 000 ₽
        (ginger, "USDT 100", Decimal("100")),  # 8 800 ₽
        (ginger, "NO GTD", None),
    ]
    for index, (club_id, name, guarantee) in enumerate(rows):
        db_session.add(
            Tournament(
                club_id=club_id,
                name=name,
                buyin=Decimal("1"),
                guarantee=guarantee,
                starts_at=start + timedelta(minutes=index),
            )
        )
    await db_session.flush()

    response = await client.get("/api/v1/tournaments/highlights", params={"per_day": 2, "days": 1})
    assert response.status_code == 200, response.text
    items = response.json()
    assert [item["name"] for item in items] == ["USDT 1000", "RUB 50000"]
    assert items[0]["guarantee_rub"] == "88000"


async def test_manual_grid_import_for_poker21(
    editor_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger21")
    data = (Path(__file__).parent / "fixtures" / "poker21-2026-09-14.csv").read_bytes()
    response = await editor_client.post(
        f"/api/v1/admin/clubs/{club_id}/templates/import",
        files={"file": ("p21.csv", data, "text/csv")},
        data={"dry_run": "false"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["issues"] == []
    assert body["rows_total"] == 22
    assert body["tournaments_created"] > 100


async def test_minor_satellites_hidden_from_players(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    ginger = await _club_id(db_session, "ginger")  # 1 фишка = 1 USDT
    ginger21 = await _club_id(db_session, "ginger21")  # 1 фишка = 1 ₽
    start = datetime.now(UTC) + timedelta(hours=1)
    rows = [
        (ginger, "SAT 24", Decimal("24")),  # $24 < $100 — скрыт
        (ginger, "SAT 200", Decimal("200")),
        (ginger21, "SAT 1000", Decimal("1000")),  # 1 000 ₽ < 5 000 ₽ — скрыт
        (ginger21, "SAT 5000", Decimal("5000")),
        (ginger21, "REGULAR", None),
    ]
    for index, (club_id, name, ticket) in enumerate(rows):
        db_session.add(
            Tournament(
                club_id=club_id,
                name=name,
                buyin=Decimal("10"),
                ticket_value=ticket,
                starts_at=start + timedelta(minutes=index),
            )
        )
    await db_session.flush()

    response = await user_client.get("/api/v1/tournaments")
    assert [item["name"] for item in response.json()] == ["SAT 200", "SAT 5000", "REGULAR"]


async def test_admin_lists_clubs_with_template_counts(
    editor_client: AsyncClient, db_session: AsyncSession
) -> None:
    club_id = await _club_id(db_session, "ginger")
    await _import(editor_client, club_id, dry_run=False)

    response = await editor_client.get("/api/v1/admin/clubs")
    assert response.status_code == 200, response.text
    by_slug = {item["slug"]: item for item in response.json()}
    assert by_slug["ginger"]["templates_count"] > 100
    assert by_slug["ginger"]["organizer_name"] == "NUTS"
    assert by_slug["ginger21"]["templates_count"] == 0
    assert by_slug["godaddy"]["is_visible"] is False
