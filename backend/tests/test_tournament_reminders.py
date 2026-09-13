from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.notifications import NotificationQueue
from app.models.tournaments import Tournament
from app.services.tournaments.reminders import reschedule_pending

pytestmark = pytest.mark.integration


async def _tournament(
    db: AsyncSession, *, starts_in: timedelta, late_reg: timedelta | None = timedelta(hours=1)
) -> Tournament:
    club = await db.scalar(select(Club).where(Club.slug == "ginger"))
    assert club is not None
    starts_at = datetime.now(UTC) + starts_in
    tournament = Tournament(
        club_id=club.id,
        name="Daily Bounty",
        buyin=Decimal("10"),
        starts_at=starts_at,
        late_reg_closes_at=starts_at + late_reg if late_reg else None,
    )
    db.add(tournament)
    await db.flush()
    return tournament


async def _queued(db: AsyncSession) -> list[NotificationQueue]:
    rows = await db.scalars(
        select(NotificationQueue)
        .where(NotificationQueue.tournament_reminder_id.is_not(None))
        .order_by(NotificationQueue.scheduled_at)
    )
    return list(rows)


def _url(tournament: Tournament) -> str:
    return f"/api/v1/me/tournament-reminders/{tournament.id}"


async def test_bells_schedule_pushes_five_minutes_ahead(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    tournament = await _tournament(db_session, starts_in=timedelta(hours=2))
    response = await user_client.put(_url(tournament), json={"kinds": ["start", "late_reg"]})
    assert response.status_code == 200, response.text
    assert {item["kind"] for item in response.json()} == {"start", "late_reg"}

    queued = await _queued(db_session)
    assert len(queued) == 2
    start, late = queued
    assert start.scheduled_at == tournament.starts_at - timedelta(minutes=5)
    assert late.scheduled_at == tournament.late_reg_closes_at - timedelta(minutes=5)
    assert start.payload["title"] == "Через 5 минут: Daily Bounty"
    assert "бай-ин $10" in str(start.payload["body"])
    assert late.payload["title"] == "Регистрация закрывается: Daily Bounty"

    listed = (await user_client.get("/api/v1/me/tournament-reminders")).json()
    assert len(listed) == 2

    # Сняли один колокольчик — его пуш ушёл из очереди.
    await user_client.put(_url(tournament), json={"kinds": ["start"]})
    assert [item.scheduled_at for item in await _queued(db_session)] == [start.scheduled_at]

    # Турнир удалён из сетки — напоминание и пуш удаляются каскадом.
    await db_session.execute(delete(Tournament).where(Tournament.id == tournament.id))
    db_session.expire_all()
    assert await _queued(db_session) == []


async def test_late_bell_fires_immediately_and_past_start_rejected(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    soon = await _tournament(db_session, starts_in=timedelta(minutes=3), late_reg=None)
    response = await user_client.put(_url(soon), json={"kinds": ["start"]})
    assert response.status_code == 200, response.text
    (queued,) = await _queued(db_session)
    assert queued.scheduled_at <= datetime.now(UTC)

    no_late = await user_client.put(_url(soon), json={"kinds": ["start", "late_reg"]})
    assert no_late.status_code == 422
    assert no_late.json()["error"]["code"] == "no_late_reg"

    started = await _tournament(db_session, starts_in=timedelta(minutes=-10))
    response = await user_client.put(_url(started), json={"kinds": ["start"]})
    assert response.json()["error"]["code"] == "reminder_too_late"
    # А конец поздней регистрации ещё впереди — на него поставить можно.
    response = await user_client.put(_url(started), json={"kinds": ["late_reg"]})
    assert response.status_code == 200, response.text


async def test_moved_late_reg_reschedules_pending_push(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    tournament = await _tournament(db_session, starts_in=timedelta(hours=2))
    await user_client.put(_url(tournament), json={"kinds": ["late_reg"]})
    await db_session.refresh(tournament)
    assert tournament.late_reg_closes_at is not None
    tournament.late_reg_closes_at += timedelta(minutes=30)
    expected = tournament.late_reg_closes_at - timedelta(minutes=5)
    await db_session.flush()
    assert await reschedule_pending(db_session) == 1
    db_session.expire_all()
    (queued,) = await _queued(db_session)
    assert queued.scheduled_at == expected
