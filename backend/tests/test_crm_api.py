from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import PushSubscription, Session, User
from app.models.chips import ChipRequest, ChipRequestItem
from app.models.clubs import Club
from app.models.enums import (
    ChipRequestKind,
    ChipRequestStatus,
    NotificationType,
    PlayerAccountStatus,
    PlayerKind,
)
from app.models.notifications import NotificationQueue
from app.models.players import Player, PlayerAccount
from app.services.crm import days_to_birthday

pytestmark = pytest.mark.integration


async def _player(
    db_session: AsyncSession,
    nickname: str,
    *,
    created_days_ago: int = 60,
    kind: PlayerKind = PlayerKind.CREDIT,
    tags: list[str] | None = None,
    birthday: date | None = None,
    push: bool = False,
) -> Player:
    created = datetime.now(UTC) - timedelta(days=created_days_ago)
    user = User(email=f"{nickname.lower()}@example.com", nickname=nickname)
    db_session.add(user)
    await db_session.flush()
    player = Player(
        user_id=user.id, kind=kind, tags=tags or [], birthday=birthday, created_at=created
    )
    db_session.add(player)
    if push:
        db_session.add(
            PushSubscription(
                user_id=user.id,
                endpoint=f"https://push.example.com/{nickname}",
                p256dh="key",
                auth="auth",
            )
        )
    await db_session.flush()
    return player


async def _request(db_session: AsyncSession, player: Player, days_ago: int) -> ChipRequest:
    club = await db_session.scalar(select(Club).where(Club.slug == "ginger"))
    assert club is not None
    account = PlayerAccount(
        player_id=player.id,
        club_id=club.id,
        nickname=player.id.hex[:8],
        app_account_id=player.id.hex[:10],
        status=PlayerAccountStatus.CONFIRMED,
    )
    db_session.add(account)
    await db_session.flush()
    request = ChipRequest(
        player_id=player.id,
        kind=ChipRequestKind.TOPUP,
        status=ChipRequestStatus.COMPLETED,
        created_at=datetime.now(UTC) - timedelta(days=days_ago),
    )
    db_session.add(request)
    await db_session.flush()
    db_session.add(
        ChipRequestItem(
            request_id=request.id,
            player_account_id=account.id,
            club_id=club.id,
            amount=Decimal("100"),
        )
    )
    await db_session.flush()
    return request


def test_days_to_birthday_wraps_year_and_leap_day() -> None:
    today = date(2026, 12, 30)
    assert days_to_birthday(date(1990, 12, 31), today) == 1
    assert days_to_birthday(date(1990, 1, 2), today) == 3
    assert days_to_birthday(date(1992, 2, 29), date(2026, 2, 27)) == 2  # → 1 марта
    assert days_to_birthday(None, today) is None


async def test_player_list_marks_sleeping_and_birthdays(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    today = datetime.now(UTC).date()
    active = await _player(db_session, "Active", birthday=today + timedelta(days=3))
    await _request(db_session, active, days_ago=2)
    sleeper = await _player(db_session, "Sleeper")
    await _request(db_session, sleeper, days_ago=45)
    await _player(db_session, "Newbie", created_days_ago=3)

    response = await admin_client.get("/api/v1/admin/players")
    assert response.status_code == 200, response.text
    rows = {row["nickname"]: row for row in response.json()}

    assert rows["Active"]["sleeping"] is False
    assert rows["Active"]["requests_30d"] == 1
    assert rows["Active"]["days_to_birthday"] in (2, 3, 4)  # граница суток по Москве
    assert rows["Sleeper"]["sleeping"] is True
    assert rows["Sleeper"]["requests_30d"] == 0
    # Новый игрок ещё не «спит»: месяц отсчитывается от регистрации.
    assert rows["Newbie"]["sleeping"] is False

    summary = (await admin_client.get("/api/v1/admin/crm/summary")).json()
    assert summary["sleeping"] >= 1
    assert "Active" in [item["nickname"] for item in summary["birthdays"]]


async def test_card_update_and_history(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    player = await _player(db_session, "Carded")
    await _request(db_session, player, days_ago=1)
    db_session.add(
        Session(
            user_id=player.user_id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
            last_seen_at=datetime.now(UTC) - timedelta(hours=2),
        )
    )
    await db_session.flush()

    updated = await admin_client.patch(
        f"/api/v1/admin/players/{player.id}",
        json={
            "real_name": " Иван Петров ",
            "telegram": "@ivan_p",
            "phone": "+7 900 000-00-00",
            "source": "Турнир во вторник",
            "birthday": "1985-05-20",
            "tags": ["vip", " #VIP ", "хайроллер", ""],
            "notes": "Берёт в долг до $500",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["real_name"] == "Иван Петров"
    assert body["telegram"] == "ivan_p"
    assert body["tags"] == ["vip", "хайроллер"]

    card = (await admin_client.get(f"/api/v1/admin/players/{player.id}")).json()
    assert card["phone"] == "+7 900 000-00-00"
    assert card["completed_topups"] == 1
    assert card["requests"][0]["summary"] == "Ginger 100"
    assert card["last_seen_at"] is not None
    assert card["notes"] == "Берёт в долг до $500"

    cleared = await admin_client.patch(
        f"/api/v1/admin/players/{player.id}", json={"real_name": "", "tags": []}
    )
    assert cleared.json()["real_name"] is None
    assert cleared.json()["tags"] == []


async def test_broadcast_to_tag_enqueues_push_and_logs(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    await _player(db_session, "VipPush", tags=["VIP"], push=True)
    await _player(db_session, "VipNoPush", tags=["vip"])
    await _player(db_session, "Regular", push=True)

    segment = {"kind": "tag", "tag": "vip"}
    preview = await admin_client.post("/api/v1/admin/broadcasts/preview", json=segment)
    assert preview.status_code == 200, preview.text
    assert preview.json() == {"recipients": 2, "with_push": 1}

    sent = await admin_client.post(
        "/api/v1/admin/broadcasts",
        json={
            "title": "Розыгрыш для VIP",
            "body": "Сегодня в 20:00 — фрироллл только для своих",
            "url": "/tournaments",
            "segment": segment,
        },
    )
    assert sent.status_code == 201, sent.text
    assert sent.json()["recipients"] == 2
    assert sent.json()["pushes"] == 1

    queued = await db_session.scalar(
        select(func.count())
        .select_from(NotificationQueue)
        .where(NotificationQueue.type == NotificationType.BROADCAST)
    )
    assert queued == 1

    history = (await admin_client.get("/api/v1/admin/broadcasts")).json()
    assert history[0]["title"] == "Розыгрыш для VIP"
    assert history[0]["segment"]["tag"] == "vip"

    external = await admin_client.post(
        "/api/v1/admin/broadcasts",
        json={"title": "x", "body": "y", "url": "https://evil.example", "segment": segment},
    )
    assert external.status_code == 422


async def test_export_csv_for_excel(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    await _player(db_session, "Exported", tags=["vip"])
    response = await admin_client.get("/api/v1/admin/players/export.csv")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    text = response.content.decode("utf-8")
    assert text.startswith("﻿Ник;Email;")
    assert "Exported;exported@example.com" in text


async def test_editor_cannot_broadcast_or_export(editor_client: AsyncClient) -> None:
    segment = {"kind": "all"}
    assert (
        await editor_client.post("/api/v1/admin/broadcasts/preview", json=segment)
    ).status_code == 403
    assert (await editor_client.get("/api/v1/admin/players/export.csv")).status_code == 403
