"""Mini-CRM (этап 9, ТЗ §9а.3): карточка человека, активность, спящие, рассылки, выгрузка.

Активность не хранится отдельным полем — считается из того, что игрок реально делает:
последний заход в приложение, последняя заявка, последнее сообщение менеджеру. «Спящий» —
месяц без активности (вопрос 8.11); у нового игрока отсчёт идёт от регистрации.
"""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.auth import PushSubscription, Session, User
from app.models.chips import ChipRequest, ChipRequestItem
from app.models.clubs import Club
from app.models.crm import Broadcast
from app.models.enums import (
    ChipRequestKind,
    ChipRequestStatus,
    NotificationType,
    PlayerKind,
    PlayerStatus,
)
from app.models.players import Player, PlayerAccount
from app.models.threads import Thread
from app.schemas.chips import PlayerAdminRead, PlayerAdminUpdate
from app.schemas.crm import (
    BirthdayItem,
    BroadcastCreate,
    BroadcastPreview,
    BroadcastRead,
    BroadcastSegment,
    CrmSummary,
    PlayerCrmCard,
    RequestBrief,
    ThreadBrief,
)
from app.services import referrals
from app.services.chips import _player_admin_read, _players_query
from app.services.push_notify import enqueue_push
from app.services.tournaments.schedule_sync import MSK

SLEEPING_AFTER = timedelta(days=30)
BIRTHDAYS_AHEAD_DAYS = 14
TAG_MAX_LENGTH = 32


@dataclass(frozen=True)
class Activity:
    last_seen_at: datetime | None
    last_request_at: datetime | None
    last_message_at: datetime | None
    requests_30d: int

    @property
    def last_activity_at(self) -> datetime | None:
        moments = [m for m in (self.last_seen_at, self.last_request_at, self.last_message_at) if m]
        return max(moments) if moments else None


def days_to_birthday(birthday: date | None, today: date) -> int | None:
    """Сколько дней до ближайшего дня рождения; 29 февраля в невисокосный год — 1 марта."""
    if birthday is None:
        return None
    for year in (today.year, today.year + 1):
        try:
            candidate = birthday.replace(year=year)
        except ValueError:
            candidate = date(year, 3, 1)
        if candidate >= today:
            return (candidate - today).days
    return None


async def _pairs(session: AsyncSession, statement: Select[Any]) -> dict[Any, Any]:
    """Результат «ключ → значение» из запроса с группировкой в две колонки."""
    return {key: value for key, value in (await session.execute(statement)).tuples()}


async def _activity(
    session: AsyncSession, players: list[Player], now: datetime
) -> dict[uuid.UUID, Activity]:
    if not players:
        return {}
    user_ids = [player.user_id for player in players]
    player_ids = [player.id for player in players]

    seen = await _pairs(
        session,
        select(Session.user_id, func.max(Session.last_seen_at))
        .where(Session.user_id.in_(user_ids))
        .group_by(Session.user_id),
    )
    last_request = await _pairs(
        session,
        select(ChipRequest.player_id, func.max(ChipRequest.created_at))
        .where(ChipRequest.player_id.in_(player_ids))
        .group_by(ChipRequest.player_id),
    )
    recent_requests = await _pairs(
        session,
        select(ChipRequest.player_id, func.count())
        .where(
            ChipRequest.player_id.in_(player_ids),
            ChipRequest.created_at >= now - SLEEPING_AFTER,
        )
        .group_by(ChipRequest.player_id),
    )
    last_message = await _pairs(
        session,
        select(Thread.player_id, func.max(Thread.last_player_message_at))
        .where(Thread.player_id.in_(player_ids))
        .group_by(Thread.player_id),
    )
    return {
        player.id: Activity(
            last_seen_at=seen.get(player.user_id),
            last_request_at=last_request.get(player.id),
            last_message_at=last_message.get(player.id),
            requests_30d=int(recent_requests.get(player.id, 0)),
        )
        for player in players
    }


def _is_sleeping(player: Player, activity: Activity, now: datetime) -> bool:
    if player.status != PlayerStatus.ACTIVE:
        return False
    reference = activity.last_activity_at or player.created_at
    return reference < now - SLEEPING_AFTER


def _crm_read(
    player: Player,
    activity: Activity,
    now: datetime,
    invited: tuple[int, int] = (0, 0),
) -> PlayerAdminRead:
    base = _player_admin_read(player, invited)
    return base.model_copy(
        update={
            "real_name": player.real_name,
            "phone": player.user.phone,
            "telegram": player.telegram,
            "source": player.source,
            "tags": list(player.tags or []),
            "last_seen_at": activity.last_seen_at,
            "last_request_at": activity.last_request_at,
            "last_activity_at": activity.last_activity_at,
            "requests_30d": activity.requests_30d,
            "sleeping": _is_sleeping(player, activity, now),
            "days_to_birthday": days_to_birthday(player.birthday, now.astimezone(MSK).date()),
        }
    )


async def list_players(session: AsyncSession, now: datetime | None = None) -> list[PlayerAdminRead]:
    moment = now or datetime.now(UTC)
    players = list(await session.scalars(_players_query().order_by(Player.created_at.desc())))
    activity = await _activity(session, players, moment)
    counts = await referrals.invited_counts(session)
    return [
        _crm_read(player, activity[player.id], moment, counts.get(player.id, (0, 0)))
        for player in players
    ]


def _clean_tags(tags: list[str]) -> list[str]:
    result: list[str] = []
    for tag in tags:
        cleaned = " ".join(tag.split()).lstrip("#")[:TAG_MAX_LENGTH]
        if cleaned and cleaned.lower() not in {existing.lower() for existing in result}:
            result.append(cleaned)
    return result


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def update_player(
    session: AsyncSession, player_id: uuid.UUID, body: PlayerAdminUpdate
) -> PlayerAdminRead:
    player = await session.scalar(_players_query().where(Player.id == player_id))
    if player is None:
        raise NotFoundError("Игрок не найден")
    fields = body.model_fields_set
    for name in ("kind", "status", "offline_access"):
        value = getattr(body, name)
        if name in fields and value is not None:
            setattr(player, name, value)
    # Текстовые поля карточки можно и очистить: пустая строка или null — «не указано».
    for name in ("notes", "real_name", "source"):
        if name in fields:
            setattr(player, name, _clean_text(getattr(body, name)))
    if "telegram" in fields:
        telegram = _clean_text(body.telegram)
        player.telegram = telegram.lstrip("@") if telegram else None
    if "birthday" in fields:
        player.birthday = body.birthday
    if "tags" in fields and body.tags is not None:
        player.tags = _clean_tags(body.tags)
    if "phone" in fields:
        player.user.phone = _clean_text(body.phone)
    await session.flush()
    moment = datetime.now(UTC)
    activity = await _activity(session, [player], moment)
    return _crm_read(player, activity[player.id], moment)


def _request_summary(request: ChipRequest) -> str:
    parts = [
        f"{item.account.club.name} {item.amount.normalize():f}"
        for item in sorted(request.items, key=lambda item: item.position)
    ]
    prefix = "Вывод · " if request.kind == ChipRequestKind.WITHDRAWAL else ""
    return prefix + ", ".join(parts)


async def get_player_card(
    session: AsyncSession, player_id: uuid.UUID, now: datetime | None = None
) -> PlayerCrmCard:
    moment = now or datetime.now(UTC)
    player = await session.scalar(_players_query().where(Player.id == player_id))
    if player is None:
        raise NotFoundError("Игрок не найден")
    activity = await _activity(session, [player], moment)
    counts = await referrals.invited_counts(session)
    base = _crm_read(player, activity[player.id], moment, counts.get(player.id, (0, 0)))

    requests = list(
        await session.scalars(
            select(ChipRequest)
            .options(
                selectinload(ChipRequest.items)
                .selectinload(ChipRequestItem.account)
                .selectinload(PlayerAccount.club)
            )
            .where(ChipRequest.player_id == player.id)
            .order_by(ChipRequest.created_at.desc())
            .limit(20)
        )
    )
    threads = list(
        await session.scalars(
            select(Thread)
            .where(Thread.player_id == player.id)
            .order_by(Thread.last_message_at.desc())
            .limit(10)
        )
    )
    completed_topups = await session.scalar(
        select(func.count())
        .select_from(ChipRequest)
        .where(
            ChipRequest.player_id == player.id,
            ChipRequest.kind == ChipRequestKind.TOPUP,
            ChipRequest.status == ChipRequestStatus.COMPLETED,
        )
    )
    referrer_nickname = None
    if player.referrer_player_id is not None:
        referrer_nickname = await session.scalar(
            select(User.nickname)
            .join(Player, Player.user_id == User.id)
            .where(Player.id == player.referrer_player_id)
        )
    invited_players = await session.scalar(
        select(func.count()).select_from(Player).where(Player.referrer_player_id == player.id)
    )
    return PlayerCrmCard(
        **base.model_dump(),
        referrer_nickname=referrer_nickname,
        invited_players=int(invited_players or 0),
        completed_topups=int(completed_topups or 0),
        requests=[
            RequestBrief(
                id=request.id,
                kind=request.kind,
                status=request.status,
                summary=_request_summary(request),
                created_at=request.created_at,
            )
            for request in requests
        ],
        threads=[
            ThreadBrief(
                id=thread.id,
                subject=thread.subject,
                status=thread.status,
                last_message_at=thread.last_message_at,
            )
            for thread in threads
        ],
    )


async def summary(session: AsyncSession, now: datetime | None = None) -> CrmSummary:
    moment = now or datetime.now(UTC)
    today = moment.astimezone(MSK).date()
    players = list(
        await session.scalars(
            select(Player)
            .options(selectinload(Player.user))
            .where(Player.status == PlayerStatus.ACTIVE)
        )
    )
    activity = await _activity(session, players, moment)
    birthdays = sorted(
        (
            BirthdayItem(
                player_id=player.id,
                nickname=player.user.nickname,
                real_name=player.real_name,
                birthday=player.birthday,
                days=days,
            )
            for player in players
            if player.birthday is not None
            and (days := days_to_birthday(player.birthday, today)) is not None
            and days <= BIRTHDAYS_AHEAD_DAYS
        ),
        key=lambda item: (item.days, item.nickname.lower()),
    )
    week_ago = moment - timedelta(days=7)
    return CrmSummary(
        birthdays=birthdays,
        sleeping=sum(1 for player in players if _is_sleeping(player, activity[player.id], moment)),
        active_7d=sum(
            1
            for player in players
            if (last := activity[player.id].last_activity_at) is not None and last >= week_ago
        ),
        new_7d=sum(1 for player in players if player.created_at >= week_ago),
        total_active=len(players),
    )


async def _segment_players(
    session: AsyncSession, segment: BroadcastSegment, now: datetime
) -> list[Player]:
    """Только активные игроки: заблокированному и архивному рассылка не уходит."""
    players = list(
        await session.scalars(
            select(Player)
            .options(selectinload(Player.user))
            .where(Player.status == PlayerStatus.ACTIVE)
            .order_by(Player.created_at)
        )
    )
    if segment.kind == "all":
        return players
    if segment.kind == "player_kind":
        if segment.player_kind is None:
            raise AppError("segment_invalid", "Не выбран тип игрока", 422)
        return [player for player in players if player.kind == PlayerKind(segment.player_kind)]
    if segment.kind == "tag":
        tag = (segment.tag or "").strip().lstrip("#").lower()
        if not tag:
            raise AppError("segment_invalid", "Не выбран тег", 422)
        return [p for p in players if tag in {t.lower() for t in (p.tags or [])}]
    if segment.kind == "players":
        wanted = set(segment.player_ids)
        if not wanted:
            raise AppError("segment_invalid", "Не выбраны игроки", 422)
        return [player for player in players if player.id in wanted]
    activity = await _activity(session, players, now)
    return [player for player in players if _is_sleeping(player, activity[player.id], now)]


async def _users_with_push(session: AsyncSession, user_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not user_ids:
        return set()
    rows = await session.scalars(
        select(PushSubscription.user_id).where(PushSubscription.user_id.in_(user_ids)).distinct()
    )
    return set(rows)


async def preview_broadcast(
    session: AsyncSession, segment: BroadcastSegment, now: datetime | None = None
) -> BroadcastPreview:
    players = await _segment_players(session, segment, now or datetime.now(UTC))
    with_push = await _users_with_push(session, [player.user_id for player in players])
    return BroadcastPreview(recipients=len(players), with_push=len(with_push))


def _broadcast_read(broadcast: Broadcast, author: str | None) -> BroadcastRead:
    return BroadcastRead(
        id=broadcast.id,
        title=broadcast.title,
        body=broadcast.body,
        url=broadcast.url,
        segment=BroadcastSegment.model_validate(broadcast.segment),
        recipients=broadcast.recipients,
        pushes=broadcast.pushes,
        author_nickname=author,
        created_at=broadcast.created_at,
    )


async def send_broadcast(
    session: AsyncSession, actor: User, body: BroadcastCreate, now: datetime | None = None
) -> BroadcastRead:
    moment = now or datetime.now(UTC)
    players = await _segment_players(session, body.segment, moment)
    if not players:
        raise AppError("segment_empty", "В сегменте нет ни одного игрока", 422)
    with_push = await _users_with_push(session, [player.user_id for player in players])
    for player in players:
        if player.user_id not in with_push:
            continue
        # Рассылку шлём и тем, кто сейчас в приложении: это новость, а не итог заявки.
        await enqueue_push(
            session,
            user_id=player.user_id,
            type=NotificationType.BROADCAST,
            title=body.title,
            body=body.body,
            url=body.url,
            now=moment,
            skip_if_in_app=False,
        )
    broadcast = Broadcast(
        created_by_user_id=actor.id,
        title=body.title,
        body=body.body,
        url=body.url,
        segment=body.segment.model_dump(mode="json"),
        recipients=len(players),
        pushes=len(with_push),
    )
    session.add(broadcast)
    await session.flush()
    await session.refresh(broadcast, attribute_names=["created_at"])
    return _broadcast_read(broadcast, actor.nickname)


async def list_broadcasts(session: AsyncSession, limit: int = 50) -> list[BroadcastRead]:
    rows = await session.execute(
        select(Broadcast, User.nickname)
        .outerjoin(User, User.id == Broadcast.created_by_user_id)
        .order_by(Broadcast.created_at.desc())
        .limit(limit)
    )
    return [_broadcast_read(broadcast, author) for broadcast, author in rows.tuples()]


EXPORT_COLUMNS = (
    "Ник",
    "Email",
    "Имя",
    "Телефон",
    "Telegram",
    "Тип",
    "Статус",
    "День рождения",
    "Теги",
    "Откуда",
    "Аккаунты",
    "С нами с",
    "Последняя активность",
    "Заявок за 30 дней",
    "Спящий",
    "Заметки",
)

_KIND_LABELS = {PlayerKind.CREDIT: "кредитный", PlayerKind.DEPOSIT: "депозитный"}
_STATUS_LABELS = {
    PlayerStatus.ACTIVE: "активен",
    PlayerStatus.BLOCKED: "заблокирован",
    PlayerStatus.ARCHIVED: "в архиве",
}


def _local(moment: datetime | None) -> str:
    return moment.astimezone(MSK).strftime("%d.%m.%Y %H:%M") if moment else ""


async def export_players_csv(session: AsyncSession) -> bytes:
    """Выгрузка базы для Excel: UTF-8 с BOM и точка с запятой — так русский Excel открывает
    файл двойным щелчком без мастера импорта."""
    rows = await list_players(session)
    clubs = {club.id: club.name for club in await session.scalars(select(Club))}
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(EXPORT_COLUMNS)
    for row in rows:
        accounts = "; ".join(
            f"{clubs.get(account.club.id, account.club.name)}: {account.nickname} "
            f"(ID {account.app_account_id})"
            for account in row.accounts
        )
        writer.writerow(
            [
                row.nickname,
                row.email,
                row.real_name or "",
                row.phone or "",
                f"@{row.telegram}" if row.telegram else "",
                _KIND_LABELS.get(row.kind, row.kind),
                _STATUS_LABELS.get(row.status, row.status),
                row.birthday.strftime("%d.%m.%Y") if row.birthday else "",
                ", ".join(row.tags),
                row.source or "",
                accounts,
                row.created_at.astimezone(MSK).strftime("%d.%m.%Y"),
                _local(row.last_activity_at),
                row.requests_30d,
                "да" if row.sleeping else "",
                (row.notes or "").replace("\r", " ").replace("\n", " "),
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
