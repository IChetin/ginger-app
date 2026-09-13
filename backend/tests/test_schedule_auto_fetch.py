from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.clubs import Club
from app.models.tournaments import TournamentTemplate
from app.services.tournaments import auto_fetch
from app.services.tournaments.auto_fetch import FetchError, fetch_club_schedule

pytestmark = pytest.mark.integration

FIXTURES = Path(__file__).parent / "fixtures"
NUTS_CSV = (FIXTURES / "nuts-2026-09-07.csv").read_bytes()
PROSTO_CSV = (FIXTURES / "prosto-private-g-2026-09-13.csv").read_bytes()


async def _club(session: AsyncSession, slug: str) -> Club:
    club = await session.scalar(select(Club).where(Club.slug == slug))
    assert club is not None
    return club


async def _templates(session: AsyncSession, club: Club) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(TournamentTemplate)
        .where(TournamentTemplate.club_id == club.id)
    )
    return int(count or 0)


def _serve(data: bytes) -> auto_fetch.Fetcher:
    async def fetch(url: str) -> bytes:
        assert url.startswith("https://docs.google.com/")
        return data

    return fetch


async def test_seeded_sources_for_nuts_and_private_g(
    db_session: AsyncSession, seeded_db: None
) -> None:
    assert (await _club(db_session, "ginger")).schedule_source_url
    assert (await _club(db_session, "private-g")).schedule_source_url
    assert (await _club(db_session, "ginger21")).schedule_source_url is None


async def test_fetch_applies_sheet_and_clears_error(
    db_session: AsyncSession, seeded_db: None
) -> None:
    club = await _club(db_session, "private-g")
    club.schedule_fetch_error = "старая ошибка"
    result = await fetch_club_schedule(db_session, club, fetcher=_serve(PROSTO_CSV))
    assert result.templates_created > 0
    assert club.schedule_fetched_at is not None
    assert club.schedule_fetch_error is None
    assert await _templates(db_session, club) == result.templates_created


async def test_broken_download_keeps_grid_and_records_error(
    db_session: AsyncSession, seeded_db: None
) -> None:
    club = await _club(db_session, "ginger")
    await fetch_club_schedule(db_session, club, fetcher=_serve(NUTS_CSV))
    before = await _templates(db_session, club)

    async def closed_sheet(url: str) -> bytes:
        raise FetchError("Вместо таблицы пришла веб-страница")

    with pytest.raises(AppError):
        await fetch_club_schedule(db_session, club, fetcher=closed_sheet)
    assert club.schedule_fetch_error == "Вместо таблицы пришла веб-страница"
    assert await _templates(db_session, club) == before


async def test_half_erased_sheet_is_not_applied(db_session: AsyncSession, seeded_db: None) -> None:
    club = await _club(db_session, "ginger")
    await fetch_club_schedule(db_session, club, fetcher=_serve(NUTS_CSV))
    before = await _templates(db_session, club)
    assert before > 100

    # Лист «в процессе правки»: остался только понедельник до обеда.
    truncated = b"\n".join(NUTS_CSV.splitlines()[:20])
    with pytest.raises(AppError) as error:
        await fetch_club_schedule(db_session, club, fetcher=_serve(truncated))
    assert "Не применено" in error.value.message
    assert await _templates(db_session, club) == before
    assert club.schedule_fetch_error is not None


async def test_admin_fetch_now_reports_error(
    admin_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def closed_sheet(url: str) -> bytes:
        raise FetchError("Лист не отдаётся: HTTP 403")

    monkeypatch.setattr(auto_fetch, "download_csv", closed_sheet)
    club = await _club(db_session, "private-g")
    response = await admin_client.post(f"/api/v1/admin/clubs/{club.id}/templates/fetch")
    assert response.status_code == 422
    assert "HTTP 403" in response.text

    listed = await admin_client.get("/api/v1/admin/clubs")
    row = next(item for item in listed.json() if item["slug"] == "private-g")
    assert row["schedule_fetch_error"] == "Лист не отдаётся: HTTP 403"

    no_source = await _club(db_session, "ginger21")
    response = await admin_client.post(f"/api/v1/admin/clubs/{no_source.id}/templates/fetch")
    assert response.status_code == 422
