from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.clubs import Club
from app.models.enums import BountyKind, TournamentStatus
from app.models.tournaments import Tournament, TournamentTemplate

pytestmark = pytest.mark.integration

TOKEN = "collector-test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


async def test_collector_updates_details_and_queues_decisions(
    admin_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "collector_token", TOKEN)
    club = await db_session.scalar(select(Club).where(Club.slug == "ginger-plus"))
    assert club is not None
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    template = TournamentTemplate(
        club_id=club.id,
        name="Magic Bounty 300",
        bounty_kind=BountyKind.KO,
        buyin=Decimal("3"),
        guarantee=Decimal("500"),
        weekdays=[1, 2, 3, 4, 5, 6, 7],
        start_time=time(11, 0),
        source="test",
    )
    db_session.add(template)
    await db_session.flush()
    ours = Tournament(
        club_id=club.id,
        template_id=template.id,
        name="Magic Bounty 300",
        bounty_kind=BountyKind.KO,
        buyin=Decimal("3"),
        guarantee=Decimal("500"),
        starts_at=now + timedelta(hours=2),
    )
    gone = Tournament(
        club_id=club.id,
        name="MINI FENIX 60K",
        buyin=Decimal("15"),
        starts_at=now + timedelta(hours=3),
    )
    db_session.add_all([ours, gone])
    await db_session.flush()

    denied = await admin_client.post(
        "/api/v1/collector/runs",
        json={"kind": "mtt", "app": "xpoker"},
        headers={"Authorization": "Bearer wrong"},
    )
    assert denied.status_code == 401

    run = await admin_client.post(
        "/api/v1/collector/runs", json={"kind": "mtt", "app": "xpoker"}, headers=AUTH
    )
    assert run.status_code == 201, run.text
    run_id = run.json()["id"]

    snapshot = await admin_client.post(
        f"/api/v1/collector/runs/{run_id}/snapshots",
        headers=AUTH,
        json={
            "club_slug": "ginger-plus",
            "window_from": now.isoformat(),
            "window_to": (now + timedelta(hours=12)).isoformat(),
            "tournaments": [
                {
                    "starts_at": (now + timedelta(hours=2, minutes=1)).isoformat(),
                    "name": "Magic Bounty 50k",
                    "buyin": "3",
                    "bounty_kind": "mystery",
                    "start_stack": 10000,
                    "level_minutes": "8/7/7",
                    "late_reg_levels": 10,
                    "app_link": "https://example.com/tournament/1",
                },
                {
                    "starts_at": (now + timedelta(hours=5)).isoformat(),
                    "name": "PLO4 PKO 20K",
                    "buyin": "5",
                    "bounty_kind": "pko",
                },
            ],
        },
    )
    assert snapshot.status_code == 200, snapshot.text
    assert snapshot.json() == {
        "matched": 1,
        "details_updated": 1,
        "links_updated": 1,
        "new": 1,
        "missing": 1,
        "changed": 1,
    }

    # Параметры и ссылка применились сами — и к старту, и к шаблону сетки.
    assert ours.start_stack == 10000
    assert template.level_minutes == "8/7/7"
    assert ours.app_link == "https://example.com/tournament/1"
    assert ours.late_reg_closes_at is not None
    # Формат — только после решения человека.
    assert ours.bounty_kind is BountyKind.KO

    changes = (await admin_client.get("/api/v1/admin/collector/changes")).json()
    by_kind = {change["kind"]: change for change in changes}
    assert by_kind["changed"]["payload"]["bounty_kind"] == {"ours": "ko", "lobby": "mystery"}
    assert by_kind["missing"]["title"] == "MINI FENIX 60K"

    applied = await admin_client.post(
        f"/api/v1/admin/collector/changes/{by_kind['changed']['id']}/apply"
    )
    assert applied.status_code == 200, applied.text
    assert ours.bounty_kind is BountyKind.MYSTERY
    assert template.bounty_kind is BountyKind.MYSTERY
    assert ours.lobby_name == "Magic Bounty 50k"

    await admin_client.post(f"/api/v1/admin/collector/changes/{by_kind['missing']['id']}/apply")
    assert gone.status is TournamentStatus.CANCELLED

    await admin_client.post(f"/api/v1/admin/collector/changes/{by_kind['new']['id']}/apply")
    created = await db_session.scalar(select(Tournament).where(Tournament.name == "PLO4 PKO 20K"))
    assert created is not None
    assert created.is_detached is True

    status = (await admin_client.get("/api/v1/admin/collector/status")).json()
    assert status["pending_changes"] == 0
    assert [(item["app"], item["kind"], item["status"]) for item in status["runs"]] == [
        ("xpoker", "mtt", "running")
    ]

    finished = await admin_client.post(
        f"/api/v1/collector/runs/{run_id}/finish", headers=AUTH, json={"status": "ok"}
    )
    assert finished.status_code == 200
    assert finished.json()["stats"]["snapshots"] == 1
