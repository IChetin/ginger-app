"""Заявки на фишки и вывод — ядро Ginger APP (ТЗ §3, §10.1; этап 5 плана сборки).

Правила (ТЗ §3.1): лимитов нет — приложение само ничего не отклоняет; отказ — сообщение с
обязательным комментарием; частичной выдачи нет; игрок заявку не отменяет; одна заявка —
несколько клубов; реквизиты вывода не храним.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.auth import User
from app.models.chips import (
    Attachment,
    ChipRequest,
    ChipRequestEvent,
    ChipRequestItem,
    RequisiteTemplate,
)
from app.models.clubs import Club
from app.models.enums import (
    ChipRequestKind,
    ChipRequestStatus,
    NotificationType,
    PlayerAccountStatus,
    PlayerKind,
    PlayerStatus,
    UserRole,
)
from app.models.players import Player, PlayerAccount
from app.schemas.chips import (
    AccountClub,
    ChipRequestAdminRead,
    ChipRequestCreate,
    ChipRequestEventRead,
    ChipRequestItemRead,
    ChipRequestRead,
    MoneyTotal,
    PendingAccountRead,
    PlayerAccountCreate,
    PlayerAccountRead,
    PlayerAdminRead,
    PlayerAdminUpdate,
    PlayerBrief,
    PlayerMe,
    PlayerMeUpdate,
    ReferralRead,
    RejectBody,
    RequisitesBody,
    RequisiteTemplateCreate,
    RequisiteTemplateRead,
    RequisiteTemplateUpdate,
)
from app.services import attachments as attachments_service
from app.services import referrals
from app.services.push_notify import enqueue_push

logger = logging.getLogger(__name__)

MSK = ZoneInfo("Europe/Moscow")
FINAL_STATUSES = frozenset(
    {ChipRequestStatus.COMPLETED, ChipRequestStatus.REJECTED, ChipRequestStatus.EXPIRED}
)
SCREENSHOT_PURPOSE = "payment_screenshot"
Status = ChipRequestStatus


# ---------------------------------------------------------------- касса и форматирование


def cashdesk_open(now: datetime) -> bool:
    settings = get_settings()
    hour = now.astimezone(MSK).hour
    opens, closes = settings.cashdesk_open_hour, settings.cashdesk_close_hour
    if opens > closes:  # через полночь: 12:00–03:00
        return hour >= opens or hour < closes
    return opens <= hour < closes


def cashdesk_hours() -> str:
    settings = get_settings()
    return f"{settings.cashdesk_open_hour:02d}:00–{settings.cashdesk_close_hour:02d}:00 МСК"


def format_amount(value: Decimal) -> str:
    """1000 → «1 000», 1.60 → «1,6»."""
    text = f"{value.normalize():,f}".replace(",", " ").replace(".", ",")
    return text.rstrip("0").rstrip(",") if "," in text else text


def _items_summary(items: list[ChipRequestItem]) -> str:
    return ", ".join(f"{item.club.name} {format_amount(item.amount)}" for item in items)


# ---------------------------------------------------------------- чтение


def _club_read(club: Club) -> AccountClub:
    return AccountClub(
        id=club.id,
        name=club.name,
        slug=club.slug,
        app=club.app,
        chip_value=club.chip_value,
        chip_currency_code=club.chip_currency_code,
        currency_symbol=club.chip_currency.symbol if club.chip_currency else None,
    )


def account_read(account: PlayerAccount) -> PlayerAccountRead:
    return PlayerAccountRead(
        id=account.id,
        club=_club_read(account.club),
        nickname=account.nickname,
        app_account_id=account.app_account_id,
        status=account.status,
        created_at=account.created_at,
    )


def _item_read(item: ChipRequestItem) -> ChipRequestItemRead:
    return ChipRequestItemRead(
        id=item.id,
        account_id=item.player_account_id,
        account_nickname=item.account.nickname,
        account_app_id=item.account.app_account_id,
        club=_club_read(item.club),
        amount=item.amount,
        chip_value=item.chip_value,
        chip_currency_code=item.chip_currency_code,
        money_amount=item.amount * item.chip_value if item.chip_value is not None else None,
    )


def _totals(items: list[ChipRequestItem]) -> list[MoneyTotal]:
    sums: dict[str, Decimal] = defaultdict(Decimal)
    symbols: dict[str, str | None] = {}
    for item in items:
        if item.chip_value is None or item.chip_currency_code is None:
            continue
        sums[item.chip_currency_code] += item.amount * item.chip_value
        currency = item.club.chip_currency
        symbols[item.chip_currency_code] = (
            currency.symbol if currency and currency.code == item.chip_currency_code else None
        )
    return [
        MoneyTotal(currency_code=code, currency_symbol=symbols[code], amount=amount)
        for code, amount in sums.items()
    ]


def request_read(request: ChipRequest) -> ChipRequestRead:
    return ChipRequestRead(
        id=request.id,
        kind=request.kind,
        status=request.status,
        items=[_item_read(item) for item in request.items],
        totals=_totals(request.items),
        payment_requisites=request.payment_requisites,
        payment_deadline_at=request.payment_deadline_at,
        has_screenshot=request.screenshot_id is not None,
        withdrawal_requisites=request.withdrawal_requisites,
        reject_comment=request.reject_comment,
        created_at=request.created_at,
        updated_at=request.updated_at,
        completed_at=request.completed_at,
    )


async def _nicknames(session: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = await session.execute(select(User.id, User.nickname).where(User.id.in_(ids)))
    return dict(rows.tuples().all())


async def _admin_reads(
    session: AsyncSession, requests: list[ChipRequest]
) -> list[ChipRequestAdminRead]:
    ids = {event.actor_user_id for request in requests for event in request.events}
    ids |= {request.handled_by_user_id for request in requests}
    nicknames = await _nicknames(session, {item for item in ids if item is not None})
    reads: list[ChipRequestAdminRead] = []
    for request in requests:
        base = request_read(request)
        user = request.player.user
        reads.append(
            ChipRequestAdminRead(
                **base.model_dump(),
                player=PlayerBrief(
                    id=request.player.id,
                    nickname=user.nickname,
                    email=user.email,
                    kind=request.player.kind,
                    status=request.player.status,
                ),
                handled_by_nickname=(
                    nicknames.get(request.handled_by_user_id)
                    if request.handled_by_user_id
                    else None
                ),
                events=[
                    ChipRequestEventRead(
                        from_status=event.from_status,
                        to_status=event.to_status,
                        comment=event.comment,
                        actor_nickname=(
                            nicknames.get(event.actor_user_id) if event.actor_user_id else None
                        ),
                        created_at=event.created_at,
                    )
                    for event in request.events
                ],
            )
        )
    return reads


def _request_query() -> Select[tuple[ChipRequest]]:
    return select(ChipRequest).options(
        selectinload(ChipRequest.items)
        .selectinload(ChipRequestItem.club)
        .selectinload(Club.chip_currency),
        selectinload(ChipRequest.items).selectinload(ChipRequestItem.account),
        selectinload(ChipRequest.player).selectinload(Player.user),
        selectinload(ChipRequest.events),
    )


async def _load_request(session: AsyncSession, request_id: uuid.UUID) -> ChipRequest | None:
    request: ChipRequest | None = await session.scalar(
        _request_query()
        .where(ChipRequest.id == request_id)
        .execution_options(populate_existing=True)
    )
    return request


def _transition(
    request: ChipRequest,
    to_status: ChipRequestStatus,
    actor_id: uuid.UUID | None,
    comment: str | None = None,
) -> None:
    request.events.append(
        ChipRequestEvent(
            actor_user_id=actor_id,
            from_status=request.status,
            to_status=to_status,
            comment=comment,
        )
    )
    request.status = to_status


def _expire_if_overdue(request: ChipRequest, now: datetime) -> bool:
    """Депозитная заявка без скриншота через 20 минут сгорает (ТЗ §3.3). Пуша нет."""
    if (
        request.status is Status.AWAITING_PAYMENT
        and request.payment_deadline_at is not None
        and request.payment_deadline_at < now
    ):
        _transition(request, Status.EXPIRED, None)
        request.payment_deadline_at = None
        return True
    return False


# ---------------------------------------------------------------- игрок


async def get_player(session: AsyncSession, user: User) -> Player:
    player = await session.scalar(
        select(Player)
        .where(Player.user_id == user.id)
        .options(
            selectinload(Player.accounts)
            .selectinload(PlayerAccount.club)
            .selectinload(Club.chip_currency)
        )
        .execution_options(populate_existing=True)
    )
    if player is None:
        raise AppError(
            "not_a_player", "Раздел доступен игрокам клуба — войдите по приглашению", 403
        )
    return player


def _require_active(player: Player) -> None:
    if player.status is not PlayerStatus.ACTIVE:
        raise AppError(
            f"player_{player.status.value}",
            "Вы заблокированы, обратитесь к администратору"
            if player.status is PlayerStatus.BLOCKED
            else "Аккаунт в архиве, обратитесь к администратору",
            403,
        )


async def player_me(session: AsyncSession, user: User, *, now: datetime | None = None) -> PlayerMe:
    player = await get_player(session, user)
    return PlayerMe(
        id=player.id,
        kind=player.kind,
        status=player.status,
        offline_access=player.offline_access,
        results_consent=player.results_consent,
        birthday=player.birthday,
        accounts=[account_read(account) for account in player.accounts],
        cashdesk_open=cashdesk_open(now or datetime.now(UTC)),
        cashdesk_hours=cashdesk_hours(),
    )


async def update_player_me(session: AsyncSession, user: User, body: PlayerMeUpdate) -> PlayerMe:
    player = await get_player(session, user)
    for name in body.model_fields_set:
        setattr(player, name, getattr(body, name))
    await session.flush()
    return await player_me(session, user)


async def add_account(
    session: AsyncSession, user: User, body: PlayerAccountCreate
) -> PlayerAccountRead:
    player = await get_player(session, user)
    _require_active(player)
    club = await session.get(Club, body.club_id)
    if club is None or not club.is_visible:
        raise NotFoundError("Клуб не найден")
    app_account_id = body.app_account_id.strip()
    taken = await session.scalar(
        select(PlayerAccount.id).where(
            PlayerAccount.club_id == club.id, PlayerAccount.app_account_id == app_account_id
        )
    )
    if taken is not None:
        raise ConflictError("Этот аккаунт уже привязан")
    account = PlayerAccount(
        player_id=player.id,
        club_id=club.id,
        nickname=body.nickname.strip(),
        app_account_id=app_account_id,
    )
    session.add(account)
    await session.flush()
    player = await get_player(session, user)
    return account_read(next(item for item in player.accounts if item.id == account.id))


async def create_request(
    session: AsyncSession,
    user: User,
    body: ChipRequestCreate,
    *,
    now: datetime | None = None,
) -> ChipRequestRead:
    moment = now or datetime.now(UTC)
    player = await get_player(session, user)
    _require_active(player)

    requisites = (body.withdrawal_requisites or "").strip() or None
    if body.kind is ChipRequestKind.WITHDRAWAL:
        if player.kind is not PlayerKind.DEPOSIT:
            raise AppError(
                "withdrawal_not_allowed", "Вывод доступен только депозитным игрокам", 403
            )
        if requisites is None:
            raise AppError("requisites_required", "Укажите реквизиты для вывода", 422)

    accounts = {account.id: account for account in player.accounts}
    request = ChipRequest(
        player_id=player.id,
        kind=body.kind,
        status=Status.SENT,
        withdrawal_requisites=requisites if body.kind is ChipRequestKind.WITHDRAWAL else None,
    )
    seen: set[uuid.UUID] = set()
    for position, item in enumerate(body.items):
        account = accounts.get(item.account_id)
        if account is None:
            raise AppError("account_not_found", "Аккаунт не найден", 422)
        if account.status is not PlayerAccountStatus.CONFIRMED:
            raise AppError(
                "account_not_confirmed",
                f"Аккаунт {account.nickname} ещё не подтверждён менеджером",
                422,
            )
        if account.id in seen:
            raise AppError("duplicate_account", f"Аккаунт {account.nickname} указан дважды", 422)
        seen.add(account.id)
        request.items.append(
            ChipRequestItem(
                position=position,
                player_account_id=account.id,
                club_id=account.club_id,
                amount=item.amount,
                chip_value=account.club.chip_value,
                chip_currency_code=account.club.chip_currency_code,
            )
        )
    request.events.append(
        ChipRequestEvent(actor_user_id=user.id, from_status=None, to_status=Status.SENT)
    )
    session.add(request)
    await session.flush()

    loaded = await _load_request(session, request.id)
    assert loaded is not None
    await _notify_managers(session, loaded, user, moment)
    return request_read(loaded)


async def _notify_managers(
    session: AsyncSession, request: ChipRequest, author: User, now: datetime
) -> None:
    """Менеджеру пуш о новой заявке — всегда, и ночью тоже (ответ 1.9)."""
    managers = await session.scalars(
        select(User.id).where(User.role.in_([UserRole.EDITOR, UserRole.ADMIN]))
    )
    title = "Заявка на вывод" if request.kind is ChipRequestKind.WITHDRAWAL else "Заявка на фишки"
    for manager_id in managers:
        await enqueue_push(
            session,
            user_id=manager_id,
            type=NotificationType.NEW_CHIP_REQUEST,
            title=title,
            body=f"{author.nickname}: {_items_summary(request.items)}",
            url=f"/admin/chips/{request.id}",
            now=now,
            skip_if_in_app=False,
        )


async def list_player_requests(
    session: AsyncSession, user: User, *, limit: int = 50, now: datetime | None = None
) -> list[ChipRequestRead]:
    moment = now or datetime.now(UTC)
    player = await get_player(session, user)
    requests = list(
        await session.scalars(
            _request_query()
            .where(ChipRequest.player_id == player.id)
            .order_by(ChipRequest.created_at.desc())
            .limit(limit)
        )
    )
    if any([_expire_if_overdue(request, moment) for request in requests]):
        await session.flush()
    return [request_read(request) for request in requests]


async def _player_request(session: AsyncSession, user: User, request_id: uuid.UUID) -> ChipRequest:
    player = await get_player(session, user)
    request = await _load_request(session, request_id)
    if request is None or request.player_id != player.id:
        raise NotFoundError("Заявка не найдена")
    return request


async def get_player_request(
    session: AsyncSession, user: User, request_id: uuid.UUID, *, now: datetime | None = None
) -> ChipRequestRead:
    request = await _player_request(session, user, request_id)
    if _expire_if_overdue(request, now or datetime.now(UTC)):
        await session.flush()
    return request_read(request)


async def attach_screenshot(
    session: AsyncSession,
    user: User,
    request_id: uuid.UUID,
    *,
    data: bytes,
    content_type: str | None,
    now: datetime | None = None,
) -> ChipRequestRead:
    moment = now or datetime.now(UTC)
    request = await _player_request(session, user, request_id)
    if _expire_if_overdue(request, moment):
        raise AppError(
            "request_expired", "Время на оплату вышло — заявка сгорела. Её можно повторить", 409
        )
    if request.status is not Status.AWAITING_PAYMENT:
        raise AppError(
            "screenshot_not_expected", "Скриншот нужен только заявке, которая ждёт оплаты", 409
        )
    attachment = await attachments_service.save_image(
        session,
        owner_user_id=user.id,
        purpose=SCREENSHOT_PURPOSE,
        data=data,
        content_type=content_type,
    )
    request.screenshot_id = attachment.id
    # Скриншот останавливает таймер: дальше ждём сверки менеджером, а не часов (ТЗ §3.3).
    request.payment_deadline_at = None
    _transition(request, Status.PAID, user.id)
    await session.flush()
    reloaded = await _load_request(session, request.id)
    assert reloaded is not None
    return request_read(reloaded)


async def _screenshot(session: AsyncSession, request: ChipRequest) -> tuple[bytes, str]:
    attachment = (
        await session.get(Attachment, request.screenshot_id) if request.screenshot_id else None
    )
    if attachment is None:
        raise NotFoundError("Скриншота нет")
    return attachments_service.read_bytes(attachment), attachment.content_type


async def player_screenshot(
    session: AsyncSession, user: User, request_id: uuid.UUID
) -> tuple[bytes, str]:
    return await _screenshot(session, await _player_request(session, user, request_id))


# ---------------------------------------------------------------- менеджер


async def list_admin_requests(
    session: AsyncSession,
    *,
    scope: str = "open",
    limit: int = 100,
    now: datetime | None = None,
) -> list[ChipRequestAdminRead]:
    moment = now or datetime.now(UTC)
    statement = _request_query()
    if scope == "open":
        # Очередь: сначала самые старые — их ждут дольше всех.
        statement = statement.where(ChipRequest.status.not_in(FINAL_STATUSES)).order_by(
            ChipRequest.created_at.asc()
        )
    else:
        statement = statement.order_by(ChipRequest.created_at.desc())
    requests = list(await session.scalars(statement.limit(limit)))
    if any([_expire_if_overdue(request, moment) for request in requests]):
        await session.flush()
    if scope == "open":
        requests = [request for request in requests if request.status not in FINAL_STATUSES]
    return await _admin_reads(session, requests)


async def _admin_request(session: AsyncSession, request_id: uuid.UUID) -> ChipRequest:
    request = await _load_request(session, request_id)
    if request is None:
        raise NotFoundError("Заявка не найдена")
    return request


async def get_admin_request(
    session: AsyncSession, request_id: uuid.UUID, *, now: datetime | None = None
) -> ChipRequestAdminRead:
    request = await _admin_request(session, request_id)
    if _expire_if_overdue(request, now or datetime.now(UTC)):
        await session.flush()
    return (await _admin_reads(session, [request]))[0]


async def admin_screenshot(session: AsyncSession, request_id: uuid.UUID) -> tuple[bytes, str]:
    return await _screenshot(session, await _admin_request(session, request_id))


async def _open_request(session: AsyncSession, request_id: uuid.UUID, now: datetime) -> ChipRequest:
    request = await _admin_request(session, request_id)
    if _expire_if_overdue(request, now):
        await session.flush()
    if request.status in FINAL_STATUSES:
        raise AppError("request_closed", "Заявка уже закрыта", 409)
    return request


async def _schedule_screenshot_deletion(
    session: AsyncSession, request: ChipRequest, now: datetime
) -> None:
    if request.screenshot_id is None:
        return
    attachment = await session.get(Attachment, request.screenshot_id)
    if attachment is not None:
        attachment.delete_after = now + timedelta(days=get_settings().screenshot_retention_days)


async def _finish(session: AsyncSession, request: ChipRequest) -> ChipRequestAdminRead:
    await session.flush()
    reloaded = await _load_request(session, request.id)
    assert reloaded is not None
    return (await _admin_reads(session, [reloaded]))[0]


async def accept_request(
    session: AsyncSession, actor: User, request_id: uuid.UUID, *, now: datetime | None = None
) -> ChipRequestAdminRead:
    moment = now or datetime.now(UTC)
    request = await _open_request(session, request_id, moment)
    if request.status is not Status.SENT:
        raise AppError(
            "invalid_transition", "Принять можно только заявку в статусе «отправлена»", 409
        )
    if request.kind is ChipRequestKind.TOPUP and request.player.kind is PlayerKind.DEPOSIT:
        raise AppError("requisites_needed", "Депозитному игроку отправьте реквизиты", 409)
    request.handled_by_user_id = actor.id
    _transition(request, Status.ACCEPTED, actor.id)
    # Промежуточные статусы не пушим (ТЗ §4.2а).
    return await _finish(session, request)


async def send_requisites(
    session: AsyncSession,
    actor: User,
    request_id: uuid.UUID,
    body: RequisitesBody,
    *,
    now: datetime | None = None,
) -> ChipRequestAdminRead:
    moment = now or datetime.now(UTC)
    settings = get_settings()
    request = await _open_request(session, request_id, moment)
    if request.kind is not ChipRequestKind.TOPUP or request.status not in {
        Status.SENT,
        Status.ACCEPTED,
    }:
        raise AppError(
            "invalid_transition", "Реквизиты отправляются на заявку пополнения до оплаты", 409
        )
    if body.template_id is not None:
        template = await session.get(RequisiteTemplate, body.template_id)
        if template is None or not template.is_active:
            raise NotFoundError("Шаблон реквизитов не найден")
        text = template.body
    else:
        text = (body.text or "").strip()

    request.payment_requisites = text
    request.payment_deadline_at = moment + timedelta(minutes=settings.chip_payment_timeout_minutes)
    request.handled_by_user_id = actor.id
    _transition(request, Status.AWAITING_PAYMENT, actor.id)
    await enqueue_push(
        session,
        user_id=request.player.user_id,
        type=NotificationType.REQUISITES_READY,
        title="Реквизиты для оплаты",
        body=(
            f"Оплатите в течение {settings.chip_payment_timeout_minutes} минут и приложите скриншот"
        ),
        url=f"/chips/{request.id}",
        now=moment,
    )
    return await _finish(session, request)


async def complete_request(
    session: AsyncSession, actor: User, request_id: uuid.UUID, *, now: datetime | None = None
) -> ChipRequestAdminRead:
    moment = now or datetime.now(UTC)
    request = await _open_request(session, request_id, moment)
    deposit_topup = (
        request.kind is ChipRequestKind.TOPUP and request.player.kind is PlayerKind.DEPOSIT
    )
    if deposit_topup and request.status not in {Status.AWAITING_PAYMENT, Status.PAID}:
        raise AppError(
            "payment_not_requested", "Депозитному сначала отправьте реквизиты на оплату", 409
        )
    request.handled_by_user_id = actor.id
    request.completed_at = moment
    request.payment_deadline_at = None
    _transition(request, Status.COMPLETED, actor.id)
    await _schedule_screenshot_deletion(session, request, moment)

    withdrawal = request.kind is ChipRequestKind.WITHDRAWAL
    await enqueue_push(
        session,
        user_id=request.player.user_id,
        type=NotificationType.WITHDRAWAL_SENT if withdrawal else NotificationType.CHIPS_ISSUED,
        title="Вывод отправлен" if withdrawal else "Фишки начислены",
        body=_items_summary(request.items),
        url=f"/chips/{request.id}",
        now=moment,
    )
    return await _finish(session, request)


async def reject_request(
    session: AsyncSession,
    actor: User,
    request_id: uuid.UUID,
    body: RejectBody,
    *,
    now: datetime | None = None,
) -> ChipRequestAdminRead:
    moment = now or datetime.now(UTC)
    request = await _open_request(session, request_id, moment)
    comment = body.comment.strip()
    request.handled_by_user_id = actor.id
    request.reject_comment = comment
    request.payment_deadline_at = None
    _transition(request, Status.REJECTED, actor.id, comment)
    await _schedule_screenshot_deletion(session, request, moment)
    # Отказ доходит так же надёжно, как выдача (ТЗ §3.1).
    await enqueue_push(
        session,
        user_id=request.player.user_id,
        type=NotificationType.REQUEST_REJECTED,
        title="Заявка отклонена",
        body=comment,
        url=f"/chips/{request.id}",
        now=moment,
    )
    return await _finish(session, request)


async def expire_overdue(session: AsyncSession, *, now: datetime | None = None) -> int:
    moment = now or datetime.now(UTC)
    requests = list(
        await session.scalars(
            _request_query().where(
                ChipRequest.status == Status.AWAITING_PAYMENT,
                ChipRequest.payment_deadline_at < moment,
            )
        )
    )
    expired = [request for request in requests if _expire_if_overdue(request, moment)]
    if expired:
        await session.flush()
    return len(expired)


async def run_housekeeping_periodically(interval_seconds: int = 60) -> None:
    """Сгорание неоплаченных заявок и удаление просроченных скриншотов."""
    from app.core.database import async_session_factory

    while True:
        try:
            async with async_session_factory() as session:
                expired = await expire_overdue(session)
                purged = await attachments_service.purge_expired(session)
                from app.services.threads import close_stale_threads

                closed = await close_stale_threads(session)
                await session.commit()
            if expired or purged or closed:
                logger.info(
                    "housekeeping: expired=%s purged=%s threads_closed=%s", expired, purged, closed
                )
        except Exception:  # noqa: BLE001 — упавший проход не должен убивать цикл
            logger.exception("chips housekeeping failed")
        await asyncio.sleep(interval_seconds)


# ---------------------------------------------------------------- шаблоны реквизитов


def _template_read(template: RequisiteTemplate) -> RequisiteTemplateRead:
    return RequisiteTemplateRead(
        id=template.id,
        title=template.title,
        body=template.body,
        is_active=template.is_active,
        sort_order=template.sort_order,
    )


async def list_templates(session: AsyncSession) -> list[RequisiteTemplateRead]:
    templates = await session.scalars(
        select(RequisiteTemplate).order_by(RequisiteTemplate.sort_order, RequisiteTemplate.title)
    )
    return [_template_read(template) for template in templates]


async def create_template(
    session: AsyncSession, body: RequisiteTemplateCreate
) -> RequisiteTemplateRead:
    template = RequisiteTemplate(
        title=body.title.strip(), body=body.body.strip(), sort_order=body.sort_order
    )
    session.add(template)
    await session.flush()
    return _template_read(template)


async def update_template(
    session: AsyncSession, template_id: uuid.UUID, body: RequisiteTemplateUpdate
) -> RequisiteTemplateRead:
    template = await session.get(RequisiteTemplate, template_id)
    if template is None:
        raise NotFoundError("Шаблон реквизитов не найден")
    for name in body.model_fields_set:
        setattr(template, name, getattr(body, name))
    await session.flush()
    return _template_read(template)


# ---------------------------------------------------------------- игроки и аккаунты


def _players_query() -> Select[tuple[Player]]:
    return select(Player).options(
        selectinload(Player.user),
        selectinload(Player.accounts)
        .selectinload(PlayerAccount.club)
        .selectinload(Club.chip_currency),
    )


def _player_admin_read(player: Player, invited: tuple[int, int] = (0, 0)) -> PlayerAdminRead:
    total, recent = invited
    return PlayerAdminRead(
        id=player.id,
        user_id=player.user_id,
        nickname=player.user.nickname,
        email=player.user.email,
        kind=player.kind,
        status=player.status,
        offline_access=player.offline_access,
        results_consent=player.results_consent,
        birthday=player.birthday,
        notes=player.notes,
        referrer_player_id=player.referrer_player_id,
        accounts=[account_read(account) for account in player.accounts],
        created_at=player.created_at,
        invited_total=total,
        invited_24h=recent,
        referral_paused=recent >= get_settings().referral_daily_limit,
    )


async def list_players(session: AsyncSession) -> list[PlayerAdminRead]:
    players = await session.scalars(_players_query().order_by(Player.created_at.desc()))
    counts = await referrals.invited_counts(session)
    return [_player_admin_read(player, counts.get(player.id, (0, 0))) for player in players]


async def referral_me(session: AsyncSession, user: User, *, rotate: bool = False) -> ReferralRead:
    player = await get_player(session, user)
    _require_active(player)
    if rotate:
        return await referrals.rotate_code(session, player)
    return await referrals.referral_read(session, player)


async def rotate_player_referral(session: AsyncSession, player_id: uuid.UUID) -> ReferralRead:
    player = await session.get(Player, player_id)
    if player is None:
        raise NotFoundError("Игрок не найден")
    return await referrals.rotate_code(session, player)


async def update_player(
    session: AsyncSession, player_id: uuid.UUID, body: PlayerAdminUpdate
) -> PlayerAdminRead:
    player = await session.scalar(_players_query().where(Player.id == player_id))
    if player is None:
        raise NotFoundError("Игрок не найден")
    for name in body.model_fields_set:
        value = getattr(body, name)
        if value is not None or name == "notes":
            setattr(player, name, value)
    await session.flush()
    return _player_admin_read(player)


def _pending_read(account: PlayerAccount) -> PendingAccountRead:
    return PendingAccountRead(
        **account_read(account).model_dump(),
        player_id=account.player_id,
        player_nickname=account.player.user.nickname,
    )


def _accounts_query() -> Select[tuple[PlayerAccount]]:
    return select(PlayerAccount).options(
        selectinload(PlayerAccount.club).selectinload(Club.chip_currency),
        selectinload(PlayerAccount.player).selectinload(Player.user),
    )


async def list_pending_accounts(session: AsyncSession) -> list[PendingAccountRead]:
    accounts = await session.scalars(
        _accounts_query()
        .where(PlayerAccount.status == PlayerAccountStatus.PENDING)
        .order_by(PlayerAccount.created_at)
    )
    return [_pending_read(account) for account in accounts]


async def review_account(
    session: AsyncSession, actor: User, account_id: uuid.UUID, *, approve: bool
) -> PendingAccountRead:
    account = await session.scalar(_accounts_query().where(PlayerAccount.id == account_id))
    if account is None:
        raise NotFoundError("Аккаунт не найден")
    account.status = PlayerAccountStatus.CONFIRMED if approve else PlayerAccountStatus.REJECTED
    account.reviewed_by_user_id = actor.id
    account.reviewed_at = datetime.now(UTC)
    await session.flush()
    return _pending_read(account)
