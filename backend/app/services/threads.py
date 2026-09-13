"""Треды с менеджером (ТЗ §6, этап 6).

Типы: вопрос, разбор раздачи, правка данных, переписка по заявке на фишки. Статусы:
открыт (ждёт менеджера) → отвечен → закрыт. Новое сообщение игрока открывает тред заново,
14 дней тишины закрывают (вопрос 11.15).

Пуши: менеджерам — о каждом сообщении игрока, всегда. Игроку на ответ менеджера по ТЗ §4.2а
пуша нет («включим, если реакция начнёт проваливаться» — флаг `thread_reply_push`): ответ
виден счётчиком в меню и блоком на главной.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import Select, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.chips import Attachment, ChipRequest
from app.models.enums import NotificationType, PlayerStatus, ThreadStatus, ThreadTopic, UserRole
from app.models.players import Player
from app.models.threads import Thread, ThreadMessage
from app.schemas.threads import ThreadCreate, ThreadMessageRead, ThreadRead, ThreadSummary
from app.services import attachments as attachments_service
from app.services.chips import cashdesk_hours, get_player
from app.services.push_notify import enqueue_push

ATTACHMENT_PURPOSE = "thread"
_PREVIEW_LENGTH = 160
_MSK = ZoneInfo("Europe/Moscow")

TOPIC_SUBJECTS = {
    ThreadTopic.QUESTION: "Вопрос",
    ThreadTopic.HAND_REVIEW: "Разбор раздачи",
    ThreadTopic.DATA_CHANGE: "Правка данных",
    ThreadTopic.CHIP_REQUEST: "Заявка на фишки",
}

Viewer = Literal["player", "manager"]
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _thread_query() -> Select[tuple[Thread]]:
    return select(Thread).options(selectinload(Thread.player).selectinload(Player.user))


def _unread(thread: Thread, viewer: Viewer) -> bool:
    if viewer == "player":
        last, read = thread.last_manager_message_at, thread.player_last_read_at
    else:
        last, read = thread.last_player_message_at, thread.manager_last_read_at
    return last is not None and last > (read or _EPOCH)


def _summary(thread: Thread, viewer: Viewer) -> ThreadSummary:
    return ThreadSummary(
        id=thread.id,
        topic=thread.topic,
        status=thread.status,
        subject=thread.subject,
        chip_request_id=thread.chip_request_id,
        last_message_at=thread.last_message_at,
        last_message_preview=thread.last_message_preview,
        unread=_unread(thread, viewer),
        player_id=thread.player_id,
        player_nickname=thread.player.user.nickname if viewer == "manager" else None,
        player_kind=thread.player.kind if viewer == "manager" else None,
    )


async def _read(session: AsyncSession, thread: Thread, viewer: Viewer) -> ThreadRead:
    messages = list(
        await session.scalars(
            select(ThreadMessage)
            .options(selectinload(ThreadMessage.author))
            .where(ThreadMessage.thread_id == thread.id)
            .order_by(ThreadMessage.created_at, ThreadMessage.id)
        )
    )
    return ThreadRead(
        **_summary(thread, viewer).model_dump(),
        messages=[
            ThreadMessageRead(
                id=message.id,
                from_manager=message.from_manager,
                author_nickname=message.author.nickname if message.author else None,
                body=message.body,
                attachment_id=message.attachment_id,
                created_at=message.created_at,
            )
            for message in messages
        ],
        manager_hours=f"{cashdesk_hours()} — на связи, в другое время постараемся",
    )


def _preview(body: str | None, has_image: bool) -> str:
    text = " ".join((body or "").split())
    if not text:
        return "Фото"
    return text if len(text) <= _PREVIEW_LENGTH else text[: _PREVIEW_LENGTH - 1] + "…"


async def _add_message(
    session: AsyncSession,
    thread: Thread,
    *,
    author: User,
    from_manager: bool,
    body: str | None,
    image: tuple[bytes, str | None] | None,
    now: datetime,
) -> ThreadMessage:
    text = (body or "").strip() or None
    if text is None and image is None:
        raise AppError("empty_message", "Напишите текст или приложите картинку", 422)
    attachment_id = None
    if image is not None:
        attachment = await attachments_service.save_image(
            session,
            owner_user_id=author.id,
            purpose=ATTACHMENT_PURPOSE,
            data=image[0],
            content_type=image[1],
        )
        attachment_id = attachment.id
    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=author.id,
        from_manager=from_manager,
        body=text,
        attachment_id=attachment_id,
        created_at=now,
    )
    session.add(message)
    thread.last_message_at = now
    thread.last_message_preview = _preview(text, image is not None)
    if from_manager:
        thread.last_manager_message_at = now
        thread.manager_last_read_at = now
        thread.status = ThreadStatus.ANSWERED
        if thread.assignee_user_id is None:
            thread.assignee_user_id = author.id
    else:
        thread.last_player_message_at = now
        thread.player_last_read_at = now
        # Новое сообщение игрока открывает тред заново, даже закрытый (ТЗ §6.1).
        thread.status = ThreadStatus.OPEN
        thread.closed_at = None
    await session.flush()
    return message


async def _notify_managers(
    session: AsyncSession, thread: Thread, author: User, preview: str | None, now: datetime
) -> None:
    managers = await session.scalars(
        select(User.id).where(User.role.in_([UserRole.EDITOR, UserRole.ADMIN]))
    )
    for manager_id in managers:
        await enqueue_push(
            session,
            user_id=manager_id,
            type=NotificationType.NEW_THREAD_MESSAGE,
            title=f"{author.nickname}: {thread.subject}",
            body=preview or "Новое сообщение",
            url=f"/admin/threads/{thread.id}",
            now=now,
            skip_if_in_app=False,
        )


async def _active_player(session: AsyncSession, user: User) -> Player:
    player = await get_player(session, user)
    if player.status is not PlayerStatus.ACTIVE:
        raise AppError("player_blocked", "Аккаунт заблокирован — обратитесь к администратору", 403)
    return player


async def _player_thread(session: AsyncSession, player: Player, thread_id: uuid.UUID) -> Thread:
    thread = await session.scalar(
        _thread_query().where(Thread.id == thread_id, Thread.player_id == player.id)
    )
    if thread is None:
        raise NotFoundError("Диалог не найден")
    return thread


async def _manager_thread(session: AsyncSession, thread_id: uuid.UUID) -> Thread:
    thread = await session.scalar(_thread_query().where(Thread.id == thread_id))
    if thread is None:
        raise NotFoundError("Диалог не найден")
    return thread


# ---------------------------------------------------------------- игрок


async def list_player_threads(
    session: AsyncSession, user: User, *, chip_request_id: uuid.UUID | None = None
) -> list[ThreadSummary]:
    player = await get_player(session, user)
    query = _thread_query().where(Thread.player_id == player.id)
    if chip_request_id is not None:
        query = query.where(Thread.chip_request_id == chip_request_id)
    threads = await session.scalars(query.order_by(Thread.last_message_at.desc()))
    return [_summary(thread, "player") for thread in threads]


async def create_thread(
    session: AsyncSession, user: User, body: ThreadCreate, *, now: datetime | None = None
) -> ThreadRead:
    moment = now or datetime.now(UTC)
    player = await _active_player(session, user)
    thread: Thread | None = None
    subject = (body.subject or "").strip() or TOPIC_SUBJECTS[body.topic]
    if body.chip_request_id is not None:
        request = await session.scalar(
            select(ChipRequest).where(
                ChipRequest.id == body.chip_request_id, ChipRequest.player_id == player.id
            )
        )
        if request is None:
            raise NotFoundError("Заявка не найдена")
        thread = await session.scalar(_thread_query().where(Thread.chip_request_id == request.id))
        subject = f"Заявка от {request.created_at.astimezone(_MSK).strftime('%d.%m %H:%M')}"
    if thread is None:
        thread = Thread(
            player_id=player.id,
            topic=body.topic,
            subject=subject,
            chip_request_id=body.chip_request_id,
            last_message_at=moment,
        )
        session.add(thread)
        await session.flush()
        thread = await _player_thread(session, player, thread.id)
    await _add_message(
        session, thread, author=user, from_manager=False, body=body.body, image=None, now=moment
    )
    await _notify_managers(session, thread, user, thread.last_message_preview, moment)
    return await _read(session, thread, "player")


async def get_player_thread(
    session: AsyncSession, user: User, thread_id: uuid.UUID, *, now: datetime | None = None
) -> ThreadRead:
    player = await get_player(session, user)
    thread = await _player_thread(session, player, thread_id)
    thread.player_last_read_at = now or datetime.now(UTC)
    await session.flush()
    return await _read(session, thread, "player")


async def post_player_message(
    session: AsyncSession,
    user: User,
    thread_id: uuid.UUID,
    *,
    body: str | None,
    image: tuple[bytes, str | None] | None = None,
    now: datetime | None = None,
) -> ThreadRead:
    moment = now or datetime.now(UTC)
    player = await _active_player(session, user)
    thread = await _player_thread(session, player, thread_id)
    await _add_message(
        session, thread, author=user, from_manager=False, body=body, image=image, now=moment
    )
    await _notify_managers(session, thread, user, thread.last_message_preview, moment)
    return await _read(session, thread, "player")


async def player_attachment(
    session: AsyncSession, user: User, thread_id: uuid.UUID, attachment_id: uuid.UUID
) -> tuple[bytes, str]:
    player = await get_player(session, user)
    thread = await _player_thread(session, player, thread_id)
    return await _attachment(session, thread, attachment_id)


# ---------------------------------------------------------------- менеджер


async def list_admin_threads(
    session: AsyncSession, *, scope: Literal["open", "all"] = "open", limit: int = 200
) -> list[ThreadSummary]:
    query = _thread_query()
    if scope == "open":
        query = query.where(Thread.status != ThreadStatus.CLOSED)
    threads = list(
        await session.scalars(query.order_by(Thread.last_message_at.desc()).limit(limit))
    )
    summaries = [_summary(thread, "manager") for thread in threads]
    # Непрочитанные сверху, внутри — по свежести.
    return sorted(summaries, key=lambda item: not item.unread)


async def get_admin_thread(
    session: AsyncSession, thread_id: uuid.UUID, *, now: datetime | None = None
) -> ThreadRead:
    thread = await _manager_thread(session, thread_id)
    thread.manager_last_read_at = now or datetime.now(UTC)
    await session.flush()
    return await _read(session, thread, "manager")


async def post_manager_message(
    session: AsyncSession,
    actor: User,
    thread_id: uuid.UUID,
    *,
    body: str | None,
    image: tuple[bytes, str | None] | None = None,
    now: datetime | None = None,
) -> ThreadRead:
    moment = now or datetime.now(UTC)
    thread = await _manager_thread(session, thread_id)
    await _add_message(
        session, thread, author=actor, from_manager=True, body=body, image=image, now=moment
    )
    if get_settings().thread_reply_push:
        await enqueue_push(
            session,
            user_id=thread.player.user_id,
            type=NotificationType.NEW_THREAD_MESSAGE,
            title=f"Ответ: {thread.subject}",
            body=thread.last_message_preview or "Новое сообщение",
            url=f"/dialogs/{thread.id}",
            now=moment,
        )
    return await _read(session, thread, "manager")


async def close_thread(
    session: AsyncSession, thread_id: uuid.UUID, *, now: datetime | None = None
) -> ThreadRead:
    thread = await _manager_thread(session, thread_id)
    if thread.status is not ThreadStatus.CLOSED:
        thread.status = ThreadStatus.CLOSED
        thread.closed_at = now or datetime.now(UTC)
        await session.flush()
    return await _read(session, thread, "manager")


async def manager_attachment(
    session: AsyncSession, thread_id: uuid.UUID, attachment_id: uuid.UUID
) -> tuple[bytes, str]:
    thread = await _manager_thread(session, thread_id)
    return await _attachment(session, thread, attachment_id)


async def _attachment(
    session: AsyncSession, thread: Thread, attachment_id: uuid.UUID
) -> tuple[bytes, str]:
    attachment = await session.scalar(
        select(Attachment)
        .join(ThreadMessage, ThreadMessage.attachment_id == Attachment.id)
        .where(ThreadMessage.thread_id == thread.id, Attachment.id == attachment_id)
    )
    if attachment is None:
        raise NotFoundError("Файл не найден")
    return attachments_service.read_bytes(attachment), attachment.content_type


# ---------------------------------------------------------------- фон


async def close_stale_threads(session: AsyncSession, *, now: datetime | None = None) -> int:
    """14 дней тишины — тред закрывается; новое сообщение игрока откроет его заново."""
    moment = now or datetime.now(UTC)
    cutoff = moment - timedelta(days=get_settings().thread_autoclose_days)
    result = await session.execute(
        update(Thread)
        .where(Thread.status != ThreadStatus.CLOSED, Thread.last_message_at < cutoff)
        .values(status=ThreadStatus.CLOSED, closed_at=moment)
    )
    return int(getattr(result, "rowcount", 0) or 0)
