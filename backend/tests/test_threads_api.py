from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.main import app
from app.models.auth import User
from app.models.chips import ChipRequest
from app.models.enums import (
    ChipRequestKind,
    NotificationType,
    PlayerKind,
    PlayerStatus,
    UserRole,
)
from app.models.notifications import NotificationQueue
from app.models.players import Player
from app.models.threads import Thread
from app.services.threads import close_stale_threads
from tests.conftest import login_as

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(autouse=True)
def _uploads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))


async def _player(db: AsyncSession, nickname: str) -> Player:
    user = User(
        email=f"{nickname}@example.com",
        nickname=nickname,
        role=UserRole.USER,
        email_verified_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    player = Player(user_id=user.id, kind=PlayerKind.CREDIT)
    db.add(player)
    await db.flush()
    return player


@asynccontextmanager
async def _as(email: str) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await login_as(client, email)
        yield client


async def _manager_pushes(db: AsyncSession) -> int:
    rows = await db.scalars(
        select(NotificationQueue.id).where(
            NotificationQueue.type == NotificationType.NEW_THREAD_MESSAGE
        )
    )
    return len(list(rows))


async def test_question_answer_and_unread_flow(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    await _player(db_session, "asker")
    async with _as("asker@example.com") as player:
        created = await player.post(
            "/api/v1/me/threads", json={"topic": "question", "body": "Как зайти в клуб?"}
        )
        assert created.status_code == 201, created.text
        thread = created.json()
        assert thread["status"] == "open"
        assert thread["subject"] == "Вопрос"
        assert thread["manager_hours"].endswith("на связи, в другое время постараемся")
        # Пуш получили оба менеджера стенда — админ и редактор.
        assert await _manager_pushes(db_session) == 2

        async with _as(get_settings().seed_editor_email) as manager:
            inbox = (await manager.get("/api/v1/admin/threads")).json()
            row = next(item for item in inbox if item["id"] == thread["id"])
            assert row["unread"] is True and row["player_nickname"] == "asker"
            opened = (await manager.get(f"/api/v1/admin/threads/{thread['id']}")).json()
            assert opened["unread"] is False
            answer = await manager.post(
                f"/api/v1/admin/threads/{thread['id']}/messages",
                json={"body": "ID клуба 1049607"},
            )
            assert answer.json()["status"] == "answered"

        listed = (await player.get("/api/v1/me/threads")).json()
        assert listed[0]["unread"] is True
        assert listed[0]["last_message_preview"] == "ID клуба 1049607"
        read = (await player.get(f"/api/v1/me/threads/{thread['id']}")).json()
        assert [m["from_manager"] for m in read["messages"]] == [False, True]
        assert (await player.get("/api/v1/me/threads")).json()[0]["unread"] is False

        again = await player.post(
            f"/api/v1/me/threads/{thread['id']}/messages", json={"body": "Спасибо!"}
        )
        assert again.json()["status"] == "open"


async def test_chip_request_has_one_thread_and_images_are_private(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    owner = await _player(db_session, "owner")
    await _player(db_session, "stranger")
    request = ChipRequest(player_id=owner.id, kind=ChipRequestKind.TOPUP)
    db_session.add(request)
    await db_session.flush()

    async with _as("owner@example.com") as player:
        body = {"topic": "chip_request", "chip_request_id": str(request.id), "body": "Где фишки?"}
        first = (await player.post("/api/v1/me/threads", json=body)).json()
        second = (await player.post("/api/v1/me/threads", json={**body, "body": "Ау"})).json()
        assert first["id"] == second["id"]
        assert len(second["messages"]) == 2
        assert second["subject"].startswith("Заявка от ")

        with_image = await player.post(
            f"/api/v1/me/threads/{first['id']}/images",
            files={"file": ("hand.png", PNG, "image/png")},
            data={"body": "Разберите раздачу"},
        )
        assert with_image.status_code == 200, with_image.text
        attachment_id = with_image.json()["messages"][-1]["attachment_id"]
        picture = await player.get(f"/api/v1/me/threads/{first['id']}/attachments/{attachment_id}")
        assert picture.status_code == 200 and picture.content == PNG

    async with _as("stranger@example.com") as other:
        stolen = await other.post(
            "/api/v1/me/threads",
            json={"topic": "chip_request", "chip_request_id": str(request.id), "body": "?"},
        )
        assert stolen.status_code == 404
        peek = await other.get(f"/api/v1/me/threads/{first['id']}/attachments/{attachment_id}")
        assert peek.status_code == 404


async def test_silence_closes_thread_and_blocked_player_cannot_write(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    player_row = await _player(db_session, "quiet")
    async with _as("quiet@example.com") as player:
        thread = (
            await player.post("/api/v1/me/threads", json={"topic": "hand_review", "body": "AK"})
        ).json()
        await db_session.execute(
            update(Thread)
            .where(Thread.id == thread["id"])
            .values(last_message_at=datetime.now(UTC) - timedelta(days=15))
        )
        assert await close_stale_threads(db_session) == 1
        reopened = await player.post(
            f"/api/v1/me/threads/{thread['id']}/messages", json={"body": "Ещё вопрос"}
        )
        assert reopened.json()["status"] == "open"

        player_row.status = PlayerStatus.BLOCKED
        await db_session.flush()
        blocked = await player.post(
            "/api/v1/me/threads", json={"topic": "question", "body": "Пустите"}
        )
        assert blocked.status_code == 403


async def test_validation(client: AsyncClient, seeded_db: None, db_session: AsyncSession) -> None:
    await _player(db_session, "strict")
    async with _as("strict@example.com") as player:
        missing = await player.post(
            "/api/v1/me/threads", json={"topic": "chip_request", "body": "без заявки"}
        )
        assert missing.status_code == 422
        empty = await player.post("/api/v1/me/threads", json={"topic": "question", "body": "  "})
        assert empty.status_code == 422
