from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.main import app
from app.models.auth import Session, User
from app.models.chips import Attachment, ChipRequest
from app.models.clubs import Club
from app.models.enums import (
    NotificationType,
    PlayerAccountStatus,
    PlayerKind,
    PlayerStatus,
    UserRole,
)
from app.models.notifications import NotificationQueue
from app.models.players import Invite, Player, PlayerAccount
from app.services import chips as chips_service
from tests.conftest import login_as

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(autouse=True)
def _uploads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))


async def _make_player(
    db: AsyncSession,
    nickname: str,
    kind: PlayerKind,
    clubs: tuple[str, ...] = ("ginger",),
    account_status: PlayerAccountStatus = PlayerAccountStatus.CONFIRMED,
) -> dict[str, str]:
    user = User(
        email=f"{nickname}@example.com",
        nickname=nickname,
        role=UserRole.USER,
        email_verified_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    player = Player(user_id=user.id, kind=kind)
    db.add(player)
    await db.flush()
    accounts: dict[str, str] = {"email": user.email, "player_id": str(player.id)}
    for slug in clubs:
        club = await db.scalar(select(Club).where(Club.slug == slug))
        assert club is not None
        account = PlayerAccount(
            player_id=player.id,
            club_id=club.id,
            nickname=nickname,
            app_account_id=f"{nickname}-{slug}",
            status=account_status,
        )
        db.add(account)
        await db.flush()
        accounts[slug] = str(account.id)
    return accounts


@asynccontextmanager
async def _logged_in(email: str) -> AsyncIterator[AsyncClient]:
    # Отдельный клиент на пользователя: повторный вход тем же email упирается в лимит кодов.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await login_as(client, email)
        yield client


async def _push_types(db: AsyncSession, user_email: str) -> list[NotificationType]:
    rows = await db.scalars(
        select(NotificationQueue.type)
        .join(User, User.id == NotificationQueue.user_id)
        .where(User.email == user_email)
        .order_by(NotificationQueue.created_at)
    )
    return list(rows)


async def _leave_app(db: AsyncSession, email: str) -> None:
    """Игрок закрыл приложение: последняя активность сессии — полчаса назад."""
    user_id = await db.scalar(select(User.id).where(User.email == email))
    await db.execute(
        update(Session)
        .where(Session.user_id == user_id)
        .values(last_seen_at=datetime.now(UTC) - timedelta(minutes=30))
    )
    await db.flush()


async def test_credit_topup_in_several_clubs(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ids = await _make_player(db_session, "credit1", PlayerKind.CREDIT, ("ginger", "ginger21"))
    settings = get_settings()

    async with _logged_in(ids["email"]) as player:
        me = (await player.get("/api/v1/me/player")).json()
        assert me["kind"] == "credit"
        assert len(me["accounts"]) == 2
        assert me["cashdesk_hours"] == "12:00–03:00 МСК"

        created = await player.post(
            "/api/v1/me/chip-requests",
            json={
                "items": [
                    {"account_id": ids["ginger"], "amount": "100"},
                    {"account_id": ids["ginger21"], "amount": "5000"},
                ]
            },
        )
        assert created.status_code == 201, created.text
        request = created.json()
        assert request["status"] == "sent"
        totals = {item["currency_code"]: Decimal(item["amount"]) for item in request["totals"]}
        assert totals == {"USDT": Decimal("100"), "RUB": Decimal("5000")}

    # Менеджерам — пуш о новой заявке, и ночью тоже.
    assert await _push_types(db_session, settings.seed_editor_email) == [
        NotificationType.NEW_CHIP_REQUEST
    ]

    async with _logged_in(settings.seed_editor_email) as editor:
        queue = (await editor.get("/api/v1/admin/chip-requests")).json()
        assert [item["id"] for item in queue] == [request["id"]]
        assert queue[0]["player"]["nickname"] == "credit1"

        accepted = await editor.post(f"/api/v1/admin/chip-requests/{request['id']}/accept")
        assert accepted.json()["status"] == "accepted"
        await _leave_app(db_session, ids["email"])
        done = await editor.post(f"/api/v1/admin/chip-requests/{request['id']}/complete")
        assert done.status_code == 200, done.text
        body = done.json()
        assert body["status"] == "completed"
        assert [event["to_status"] for event in body["events"]] == [
            "sent",
            "accepted",
            "completed",
        ]
        assert body["handled_by_nickname"] == settings.seed_editor_nickname
        assert (await editor.get("/api/v1/admin/chip-requests")).json() == []

    # Промежуточный «принята» не пушится, итог — да.
    assert await _push_types(db_session, ids["email"]) == [NotificationType.CHIPS_ISSUED]


async def test_no_push_while_player_in_app(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ids = await _make_player(db_session, "credit2", PlayerKind.CREDIT)
    async with _logged_in(ids["email"]) as player:
        request = (
            await player.post(
                "/api/v1/me/chip-requests",
                json={"items": [{"account_id": ids["ginger"], "amount": "10"}]},
            )
        ).json()
    async with _logged_in(get_settings().seed_editor_email) as editor:
        await editor.post(f"/api/v1/admin/chip-requests/{request['id']}/complete")
    # Игрок только что был в приложении — экран обновится сам, шторка молчит.
    assert await _push_types(db_session, ids["email"]) == []


async def test_deposit_flow_with_screenshot(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ids = await _make_player(db_session, "deposit1", PlayerKind.DEPOSIT)
    async with (
        _logged_in(ids["email"]) as player,
        _logged_in(get_settings().seed_editor_email) as editor,
    ):
        request = (
            await player.post(
                "/api/v1/me/chip-requests",
                json={"items": [{"account_id": ids["ginger"], "amount": "50"}]},
            )
        ).json()
        url = f"/api/v1/admin/chip-requests/{request['id']}"

        refused = await editor.post(f"{url}/accept")
        assert refused.status_code == 409
        assert refused.json()["error"]["code"] == "requisites_needed"
        assert (await editor.post(f"{url}/complete")).json()["error"]["code"] == (
            "payment_not_requested"
        )

        template = await editor.post(
            "/api/v1/admin/requisite-templates",
            json={"title": "Карта", "body": "Карта 1111, Иван И."},
        )
        assert template.status_code == 201, template.text
        await _leave_app(db_session, ids["email"])
        sent = await editor.post(f"{url}/requisites", json={"template_id": template.json()["id"]})
        assert sent.status_code == 200, sent.text
        deadline = datetime.fromisoformat(sent.json()["payment_deadline_at"])
        assert timedelta(minutes=19) < deadline - datetime.now(UTC) <= timedelta(minutes=20)

        mine = (await player.get(f"/api/v1/me/chip-requests/{request['id']}")).json()
        assert mine["status"] == "awaiting_payment"
        assert mine["payment_requisites"] == "Карта 1111, Иван И."

        uploaded = await player.post(
            f"/api/v1/me/chip-requests/{request['id']}/screenshot",
            files={"file": ("pay.png", PNG, "image/png")},
        )
        assert uploaded.status_code == 200, uploaded.text
        assert uploaded.json()["status"] == "paid"
        assert uploaded.json()["payment_deadline_at"] is None  # скриншот останавливает таймер
        assert uploaded.json()["has_screenshot"] is True

        image = await editor.get(f"{url}/screenshot")
        assert image.content == PNG
        assert image.headers["content-type"] == "image/png"

        await _leave_app(db_session, ids["email"])
        done = await editor.post(f"{url}/complete")
        assert done.json()["status"] == "completed"

    attachment = await db_session.scalar(select(Attachment))
    assert attachment is not None and attachment.delete_after is not None
    assert attachment.delete_after - datetime.now(UTC) > timedelta(days=89)
    assert await _push_types(db_session, ids["email"]) == [
        NotificationType.REQUISITES_READY,
        NotificationType.CHIPS_ISSUED,
    ]


async def test_unpaid_request_expires_after_20_minutes(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ids = await _make_player(db_session, "deposit2", PlayerKind.DEPOSIT)
    async with (
        _logged_in(ids["email"]) as player,
        _logged_in(get_settings().seed_editor_email) as editor,
    ):
        request = (
            await player.post(
                "/api/v1/me/chip-requests",
                json={"items": [{"account_id": ids["ginger"], "amount": "50"}]},
            )
        ).json()
        await editor.post(
            f"/api/v1/admin/chip-requests/{request['id']}/requisites", json={"text": "USDT TRC20"}
        )
        expired = await chips_service.expire_overdue(
            db_session, now=datetime.now(UTC) + timedelta(minutes=21)
        )
        assert expired == 1

        mine = (await player.get(f"/api/v1/me/chip-requests/{request['id']}")).json()
        assert mine["status"] == "expired"
        late = await player.post(
            f"/api/v1/me/chip-requests/{request['id']}/screenshot",
            files={"file": ("pay.png", PNG, "image/png")},
        )
        assert late.status_code == 409
    # Пуша о сгорании нет (ТЗ §3.3).
    assert NotificationType.REQUEST_REJECTED not in await _push_types(db_session, ids["email"])


async def test_reject_needs_comment_and_closes_request(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ids = await _make_player(db_session, "credit3", PlayerKind.CREDIT)
    async with (
        _logged_in(ids["email"]) as player,
        _logged_in(get_settings().seed_editor_email) as editor,
    ):
        request = (
            await player.post(
                "/api/v1/me/chip-requests",
                json={"items": [{"account_id": ids["ginger"], "amount": "500"}]},
            )
        ).json()
        url = f"/api/v1/admin/chip-requests/{request['id']}"
        assert (await editor.post(f"{url}/reject", json={"comment": ""})).status_code == 422
        rejected = await editor.post(f"{url}/reject", json={"comment": "Сначала закройте долг"})
        assert rejected.json()["status"] == "rejected"
        again = await editor.post(f"{url}/accept")
        assert again.json()["error"]["code"] == "request_closed"

        mine = (await player.get(f"/api/v1/me/chip-requests/{request['id']}")).json()
        assert mine["reject_comment"] == "Сначала закройте долг"


async def test_withdrawal_rules(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    credit = await _make_player(db_session, "credit4", PlayerKind.CREDIT)
    deposit = await _make_player(db_session, "deposit4", PlayerKind.DEPOSIT)
    async with _logged_in(credit["email"]) as player:
        denied = await player.post(
            "/api/v1/me/chip-requests",
            json={
                "kind": "withdrawal",
                "items": [{"account_id": credit["ginger"], "amount": "10"}],
                "withdrawal_requisites": "карта",
            },
        )
        assert denied.status_code == 403
    async with _logged_in(deposit["email"]) as player:
        no_requisites = await player.post(
            "/api/v1/me/chip-requests",
            json={
                "kind": "withdrawal",
                "items": [{"account_id": deposit["ginger"], "amount": "10"}],
            },
        )
        assert no_requisites.json()["error"]["code"] == "requisites_required"
        created = await player.post(
            "/api/v1/me/chip-requests",
            json={
                "kind": "withdrawal",
                "items": [{"account_id": deposit["ginger"], "amount": "10"}],
                "withdrawal_requisites": "USDT TRC20 T123",
            },
        )
        assert created.status_code == 201
    async with _logged_in(get_settings().seed_editor_email) as editor:
        url = f"/api/v1/admin/chip-requests/{created.json()['id']}"
        assert (await editor.post(f"{url}/accept")).json()["status"] == "accepted"
        assert (await editor.post(f"{url}/complete")).json()["status"] == "completed"


async def test_accounts_need_confirmation(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    ids = await _make_player(db_session, "newbie", PlayerKind.CREDIT, clubs=())
    ginger21 = await db_session.scalar(select(Club.id).where(Club.slug == "ginger21"))
    async with _logged_in(ids["email"]) as player:
        added = await player.post(
            "/api/v1/me/accounts",
            json={"club_id": str(ginger21), "nickname": "newbie", "app_account_id": "777"},
        )
        assert added.status_code == 201, added.text
        assert added.json()["status"] == "pending"
        duplicate = await player.post(
            "/api/v1/me/accounts",
            json={"club_id": str(ginger21), "nickname": "x", "app_account_id": "777"},
        )
        assert duplicate.status_code == 409

        pending = await player.post(
            "/api/v1/me/chip-requests",
            json={"items": [{"account_id": added.json()["id"], "amount": "1000"}]},
        )
        assert pending.json()["error"]["code"] == "account_not_confirmed"

        async with _logged_in(get_settings().seed_editor_email) as editor:
            queue = (await editor.get("/api/v1/admin/player-accounts/pending")).json()
            assert [item["player_nickname"] for item in queue] == ["newbie"]
            confirmed = await editor.post(
                f"/api/v1/admin/player-accounts/{added.json()['id']}/confirm"
            )
            assert confirmed.json()["status"] == "confirmed"

        ok = await player.post(
            "/api/v1/me/chip-requests",
            json={"items": [{"account_id": added.json()["id"], "amount": "1000"}]},
        )
        assert ok.status_code == 201


async def test_access_rules(client: AsyncClient, seeded_db: None, db_session: AsyncSession) -> None:
    first = await _make_player(db_session, "first", PlayerKind.CREDIT)
    second = await _make_player(db_session, "second", PlayerKind.CREDIT)
    async with _logged_in(first["email"]) as player:
        request = (
            await player.post(
                "/api/v1/me/chip-requests",
                json={"items": [{"account_id": first["ginger"], "amount": "10"}]},
            )
        ).json()
        # Чужой аккаунт в заявку не подставить.
        foreign = await player.post(
            "/api/v1/me/chip-requests",
            json={"items": [{"account_id": second["ginger"], "amount": "10"}]},
        )
        assert foreign.json()["error"]["code"] == "account_not_found"
        assert (await player.get("/api/v1/admin/chip-requests")).status_code == 403
    async with _logged_in(second["email"]) as other:
        assert (await other.get(f"/api/v1/me/chip-requests/{request['id']}")).status_code == 404

        # Блокировка действует сразу, без перелогина.
        await db_session.execute(
            update(Player)
            .where(Player.id == second["player_id"])
            .values(status=PlayerStatus.BLOCKED)
        )
        await db_session.flush()
        denied = await other.post(
            "/api/v1/me/chip-requests",
            json={"items": [{"account_id": second["ginger"], "amount": "10"}]},
        )
        assert denied.json()["error"]["code"] == "player_blocked"

    # Менеджер без записи игрока — раздел «Фишки» не для него.
    async with _logged_in(get_settings().seed_editor_email) as editor:
        me = await editor.get("/api/v1/me/player")
        assert me.json()["error"]["code"] == "not_a_player"


async def test_registration_by_invite(
    client: AsyncClient, seeded_db: None, db_session: AsyncSession
) -> None:
    async with _logged_in(get_settings().seed_admin_email) as admin:
        created = await admin.post(
            "/api/v1/admin/invites", json={"player_kind": "deposit", "note": "Олег с офлайна"}
        )
        assert created.status_code == 201, created.text
        invite = created.json()
        assert invite["state"] == "active"
        assert invite["path"] == f"/invite/{invite['token']}"

    assert (await client.get(f"/api/v1/invites/{invite['token']}")).json() == {
        "valid": True,
        "reason": None,
        "referrer_nickname": None,
    }
    email = "oleg@example.com"
    without = await client.post(
        "/api/v1/auth/register/start", json={"email": email, "privacy_consent": True}
    )
    assert without.status_code == 403
    assert without.json()["error"]["code"] == "invite_required"

    start = await client.post(
        "/api/v1/auth/register/start",
        json={"email": email, "privacy_consent": True, "invite_token": invite["token"]},
    )
    assert start.status_code == 200, start.text
    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": email, "code": get_settings().dev_otp_code},
    )
    assert verify.status_code == 200, verify.text
    complete = await client.post(
        "/api/v1/auth/register/complete",
        json={
            "registration_token": verify.json()["registration_token"],
            "password": "Ginger-fox-2026!",
            "nickname": "oleg",
            "invite_token": invite["token"],
        },
    )
    assert complete.status_code == 200, complete.text

    player = await db_session.scalar(
        select(Player).join(User, User.id == Player.user_id).where(User.email == email)
    )
    assert player is not None and player.kind is PlayerKind.DEPOSIT
    used = await db_session.scalar(select(Invite))
    assert used is not None and used.used_at is not None
    assert (await client.get(f"/api/v1/invites/{invite['token']}")).json() == {
        "valid": False,
        "reason": "used",
        "referrer_nickname": None,
    }
    reuse = await client.post(
        "/api/v1/auth/register/start",
        json={
            "email": "second@example.com",
            "privacy_consent": True,
            "invite_token": invite["token"],
        },
    )
    assert reuse.json()["error"]["code"] == "invite_used"
    assert await db_session.scalar(select(func.count()).select_from(ChipRequest)) == 0
