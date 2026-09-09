from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any, Literal, cast
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.auth import User
from app.models.enums import EventStatus, HandStatus, SeriesStatus
from app.models.hands import Hand
from app.models.live import LiveSession
from app.models.schedule import Event, Series
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.hands import (
    HandAuthor,
    HandCreate,
    HandDocument,
    HandDraftCreate,
    HandDraftUpdate,
    HandEventBrief,
    HandLinkTarget,
    HandListItem,
    HandListStatusFilter,
    HandPatch,
    HandPreview,
    HandPublish,
    HandRead,
    HandSeriesBrief,
    HandUpdate,
    StreetName,
    parse_stored_hand,
)
from app.services.hand_slug import generate_hand_slug
from app.services.live import get_active_session, list_candidates

DRAFT_LIMIT = 20
EMPTY_WIZARD: dict[str, Any] = {"step": 1, "furthestStep": 1}
_STREET_NAMES: frozenset[str] = frozenset({"preflop", "flop", "turn", "river"})
_DEFAULT_SEAT_NAME = re.compile(r"^Игрок \d+$")
_OPPONENT_NAMES_LIMIT = 10
_OPPONENT_NAMES_SCAN = 80
_LINK_SEARCH_LIMIT = 20
LinkSection = Literal["live", "today", "running", "search"]
_RUNNING_SERIES_STATUSES = (
    SeriesStatus.ANNOUNCED,
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
)

_CRAWLER_RE = re.compile(
    r"TelegramBot|facebookexternalhit|Facebot|Twitterbot|WhatsApp|Slackbot|"
    r"vkShare|LinkedInBot|Discordbot|SkypeUriPreview|Googlebot",
    re.I,
)


def is_crawler_ua(user_agent: str | None) -> bool:
    if not user_agent:
        return False
    return _CRAWLER_RE.search(user_agent) is not None


def parse_hand_ref(value: str) -> UUID | str:
    try:
        return UUID(value)
    except ValueError:
        return value


def _event_label(event: Event) -> str:
    if event.number is not None:
        return f"#{event.number} {event.name}"
    return event.name


def _preview(data: HandDocument) -> HandPreview:
    hero = next((seat for seat in data.seats if seat.is_hero), data.seats[0])
    board: list[str] = []
    for street in data.streets:
        if street.board:
            board = list(street.board)
    return HandPreview(
        hero_cards=list(hero.cards),
        board=board,
        hero_profit=data.result.hero_profit,
        pot=data.result.pot,
    )


def _draft_preview(data: dict[str, Any]) -> HandPreview:
    raw_hero = data.get("heroCards")
    hero_cards: list[str] = []
    if isinstance(raw_hero, list):
        hero_cards = [card for card in raw_hero if isinstance(card, str)][:2]
    board: list[str] = []
    streets = data.get("streets")
    if isinstance(streets, list):
        for item in streets:
            if isinstance(item, dict) and isinstance(item.get("board"), list) and item["board"]:
                board = [card for card in item["board"] if isinstance(card, str)]
    return HandPreview(hero_cards=hero_cards, board=board, hero_profit=0, pot=0)


def _wizard_street(data: dict[str, Any]) -> StreetName | None:
    if data.get("step") != 3:
        return None
    streets = data.get("streets")
    if not isinstance(streets, list) or not streets:
        return "preflop"
    idx = data.get("activeStreetIndex")
    if not isinstance(idx, int):
        idx = 0
    item = streets[idx] if 0 <= idx < len(streets) else streets[0]
    if isinstance(item, dict):
        street = item.get("street")
        if street in _STREET_NAMES:
            return cast(StreetName, street)
    return "preflop"


def _event_brief(event: Event | None) -> HandEventBrief | None:
    if event is None:
        return None
    series_name = event.series.name if event.series is not None else ""
    return HandEventBrief(id=event.id, name=_event_label(event), series_name=series_name)


def _series_brief(series: Series | None) -> HandSeriesBrief | None:
    if series is None:
        return None
    return HandSeriesBrief(id=series.id, name=series.name)


def _is_draft(row: Hand) -> bool:
    return row.status == HandStatus.DRAFT


def _draft_worth_keeping(row: Hand) -> bool:
    """Черновик без карт, действий и заметки не показываем в списке."""
    data = row.data if isinstance(row.data, dict) else {}
    step = row.current_step if row.current_step is not None else data.get("step")
    if isinstance(step, int) and step > 1:
        return True
    furthest = data.get("furthestStep")
    if isinstance(furthest, int) and furthest > 1:
        return True
    hero = data.get("heroCards")
    if isinstance(hero, list) and any(isinstance(card, str) and card for card in hero):
        return True
    streets = data.get("streets")
    if isinstance(streets, list):
        for item in streets:
            if not isinstance(item, dict):
                continue
            actions = item.get("actions")
            if isinstance(actions, list) and len(actions) > 0:
                return True
            board = item.get("board")
            if isinstance(board, list) and any(isinstance(card, str) and card for card in board):
                return True
    note = row.note if isinstance(row.note, str) else data.get("note")
    if isinstance(note, str) and note.strip():
        return True
    if row.event_id is not None or row.series_id is not None or row.live_session_id is not None:
        return True
    if data.get("eventId") or data.get("seriesId") or data.get("liveSessionId"):
        return True
    names = data.get("names")
    if isinstance(names, dict) and any(
        isinstance(value, str) and value.strip() for value in names.values()
    ):
        return True
    showdown = data.get("showdownCards")
    if isinstance(showdown, dict) and any(showdown.values()):
        return True
    winners = data.get("winnerSeats")
    if isinstance(winners, list) and len(winners) > 0:
        return True
    stacks = data.get("stacks")
    return isinstance(stacks, dict) and any(
        isinstance(value, str) and value.strip() for value in stacks.values()
    )


async def _empty_draft_ids(session: AsyncSession, user_id: UUID) -> list[UUID]:
    rows = list(
        await session.scalars(
            select(Hand).where(Hand.user_id == user_id, Hand.status == HandStatus.DRAFT)
        )
    )
    return [row.id for row in rows if not _draft_worth_keeping(row)]


def to_list_item(row: Hand) -> HandListItem:
    if _is_draft(row):
        preview = _draft_preview(row.data)
        current_street = _wizard_street(row.data)
    else:
        preview = _preview(parse_stored_hand(row.data))
        current_street = None
    return HandListItem(
        id=row.id,
        slug=row.slug,
        status=row.status.value,
        current_step=row.current_step,
        current_street=current_street,
        title=row.title,
        note=row.note,
        is_public=row.is_public,
        views_count=row.views_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
        preview=preview,
        event=_event_brief(row.event),
        series=_series_brief(row.series),
    )


def to_read(row: Hand, viewer: User | None) -> HandRead:
    is_draft = _is_draft(row)
    return HandRead(
        id=row.id,
        slug=row.slug,
        status=row.status.value,
        current_step=row.current_step,
        current_street=_wizard_street(row.data) if is_draft else None,
        title=row.title,
        note=row.note,
        is_public=row.is_public,
        views_count=row.views_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
        event_id=row.event_id,
        series_id=row.series_id,
        live_session_id=row.live_session_id,
        event=_event_brief(row.event),
        series=_series_brief(row.series),
        author=HandAuthor(nickname=row.user.nickname),
        is_owner=viewer is not None and viewer.id == row.user_id,
        data=None if is_draft else parse_stored_hand(row.data),
        wizard=row.data if is_draft else None,
    )


def _query():
    return select(Hand).options(
        selectinload(Hand.user),
        selectinload(Hand.event).selectinload(Event.series),
        selectinload(Hand.series),
    )


async def _get_by_id(session: AsyncSession, hand_id: UUID) -> Hand | None:
    return cast(Hand | None, await session.scalar(_query().where(Hand.id == hand_id)))


async def _get_by_slug(session: AsyncSession, slug: str) -> Hand | None:
    return cast(Hand | None, await session.scalar(_query().where(Hand.slug == slug)))


async def _get_row(session: AsyncSession, slug: str) -> Hand | None:
    return await _get_by_slug(session, slug)


async def _get_by_ref(session: AsyncSession, ref: str) -> Hand | None:
    parsed = parse_hand_ref(ref)
    if isinstance(parsed, UUID):
        return await _get_by_id(session, parsed)
    return await _get_by_slug(session, parsed)


async def _reload(session: AsyncSession, hand_id: UUID) -> Hand:
    loaded = await _get_by_id(session, hand_id)
    assert loaded is not None
    return loaded


async def _assert_event(session: AsyncSession, event_id: UUID | None) -> None:
    if event_id is None:
        return
    exists = await session.scalar(select(Event.id).where(Event.id == event_id))
    if exists is None:
        raise AppError("validation_error", "Турнир не найден", 422)


async def _assert_series(session: AsyncSession, series_id: UUID | None) -> None:
    if series_id is None:
        return
    exists = await session.scalar(select(Series.id).where(Series.id == series_id))
    if exists is None:
        raise AppError("validation_error", "Серия не найдена", 422)


def _assert_exclusive_links(event_id: UUID | None, series_id: UUID | None) -> None:
    if event_id is not None and series_id is not None:
        raise AppError(
            "validation_error",
            "Раздача привязывается либо к турниру, либо к серии",
            422,
        )


async def _assert_live_session(
    session: AsyncSession,
    user: User,
    live_session_id: UUID | None,
) -> None:
    if live_session_id is None:
        return
    row = await session.scalar(
        select(LiveSession.id).where(
            LiveSession.id == live_session_id,
            LiveSession.user_id == user.id,
        )
    )
    if row is None:
        raise AppError("validation_error", "Живая сессия не найдена", 422)


async def _apply_links(
    session: AsyncSession,
    user: User,
    row: Hand,
    *,
    event_id: UUID | None,
    series_id: UUID | None,
    live_session_id: UUID | None,
    clear_event: bool,
    clear_series: bool,
    clear_live_session: bool,
) -> None:
    setting_event = event_id is not None and not clear_event
    setting_series = series_id is not None and not clear_series
    if setting_event and setting_series:
        _assert_exclusive_links(event_id, series_id)
    if clear_event:
        row.event_id = None
    elif setting_event:
        await _assert_event(session, event_id)
        row.event_id = event_id
        row.series_id = None
    if clear_series:
        row.series_id = None
    elif setting_series:
        await _assert_series(session, series_id)
        row.series_id = series_id
        row.event_id = None
    if clear_live_session:
        row.live_session_id = None
    elif live_session_id is not None:
        await _assert_live_session(session, user, live_session_id)
        row.live_session_id = live_session_id


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _same_updated_at(row_ts: datetime, base: datetime) -> bool:
    return _aware(row_ts) == _aware(base)


async def _draft_count(session: AsyncSession, user_id: UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Hand)
            .where(Hand.user_id == user_id, Hand.status == HandStatus.DRAFT)
        )
        or 0
    )


def _wizard_payload(raw: dict[str, Any] | None, current_step: int) -> dict[str, Any]:
    data = dict(raw) if raw else dict(EMPTY_WIZARD)
    data["step"] = current_step
    return data


async def create_hand(session: AsyncSession, user: User, body: HandCreate) -> Hand:
    _assert_exclusive_links(body.event_id, body.series_id)
    await _assert_event(session, body.event_id)
    await _assert_series(session, body.series_id)
    await _assert_live_session(session, user, body.live_session_id)
    payload = body.data.model_dump(mode="json")
    last_error: IntegrityError | None = None
    for _ in range(8):
        row = Hand(
            id=uuid4(),
            user_id=user.id,
            slug=generate_hand_slug(),
            status=HandStatus.PUBLISHED,
            current_step=None,
            event_id=body.event_id,
            series_id=body.series_id,
            live_session_id=body.live_session_id,
            is_public=body.is_public,
            title=body.title,
            note=body.note,
            data=payload,
        )
        try:
            async with session.begin_nested():
                session.add(row)
                await session.flush()
            return await _reload(session, row.id)
        except IntegrityError as exc:
            last_error = exc
            continue
    raise AppError(
        "conflict",
        "Не удалось выдать ссылку, попробуйте ещё раз",
        409,
    ) from last_error


async def create_draft(
    session: AsyncSession, user: User, body: HandDraftCreate
) -> tuple[Hand, bool]:
    existing = await _get_by_id(session, body.id)
    if existing is not None:
        if existing.user_id != user.id:
            raise ConflictError("Черновик с таким id уже есть")
        if not _is_draft(existing):
            raise ConflictError("Эта раздача уже опубликована")
        return existing, False
    if await _draft_count(session, user.id) >= DRAFT_LIMIT:
        raise ConflictError(
            "Не больше 20 черновиков. Удалите старые в списке",
            code="draft_limit",
        )
    _assert_exclusive_links(body.event_id, body.series_id)
    await _assert_event(session, body.event_id)
    await _assert_series(session, body.series_id)
    await _assert_live_session(session, user, body.live_session_id)
    payload = _wizard_payload(body.wizard, body.current_step)
    if body.slug is not None:
        row = Hand(
            id=body.id,
            user_id=user.id,
            slug=body.slug,
            status=HandStatus.DRAFT,
            current_step=body.current_step,
            event_id=body.event_id,
            series_id=body.series_id,
            live_session_id=body.live_session_id,
            is_public=False,
            title=body.title,
            note=body.note,
            data=payload,
        )
        try:
            async with session.begin_nested():
                session.add(row)
                await session.flush()
        except IntegrityError as exc:
            raise ConflictError("Эта ссылка уже занята", code="slug_taken") from exc
        return await _reload(session, row.id), True
    last_error: IntegrityError | None = None
    for _ in range(8):
        row = Hand(
            id=body.id,
            user_id=user.id,
            slug=generate_hand_slug(),
            status=HandStatus.DRAFT,
            current_step=body.current_step,
            event_id=body.event_id,
            series_id=body.series_id,
            live_session_id=body.live_session_id,
            is_public=False,
            title=body.title,
            note=body.note,
            data=payload,
        )
        try:
            async with session.begin_nested():
                session.add(row)
                await session.flush()
            return await _reload(session, row.id), True
        except IntegrityError as exc:
            last_error = exc
            continue
    raise AppError(
        "conflict",
        "Не удалось выдать ссылку, попробуйте ещё раз",
        409,
    ) from last_error


async def list_hands(
    session: AsyncSession,
    user: User,
    pagination: PaginationParams,
    event_id: UUID | None = None,
    q: str | None = None,
    status: HandListStatusFilter = "all",
) -> PaginatedResponse[HandListItem]:
    hide_ids = await _empty_draft_ids(session, user.id)
    stmt = select(Hand).where(Hand.user_id == user.id)
    count_stmt = select(func.count()).select_from(Hand).where(Hand.user_id == user.id)
    if hide_ids:
        stmt = stmt.where(Hand.id.notin_(hide_ids))
        count_stmt = count_stmt.where(Hand.id.notin_(hide_ids))
    if status == "draft":
        stmt = stmt.where(Hand.status == HandStatus.DRAFT)
        count_stmt = count_stmt.where(Hand.status == HandStatus.DRAFT)
    elif status == "published":
        stmt = stmt.where(Hand.status == HandStatus.PUBLISHED)
        count_stmt = count_stmt.where(Hand.status == HandStatus.PUBLISHED)
    if event_id is not None:
        stmt = stmt.where(Hand.event_id == event_id)
        count_stmt = count_stmt.where(Hand.event_id == event_id)
    needle = (q or "").strip()
    if needle:
        pattern = f"%{needle}%"
        filt = or_(Hand.note.ilike(pattern), Hand.title.ilike(pattern))
        stmt = stmt.where(filt)
        count_stmt = count_stmt.where(filt)
    stmt = stmt.order_by(Hand.updated_at.desc(), Hand.id.desc())
    total = int(await session.scalar(count_stmt) or 0)
    rows = list(
        await session.scalars(
            stmt.options(
                selectinload(Hand.user),
                selectinload(Hand.event).selectinload(Event.series),
                selectinload(Hand.series),
            )
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
    )
    return PaginatedResponse(
        items=[to_list_item(row) for row in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


def _collect_opponent_names(row: Hand) -> list[str]:
    data = row.data if isinstance(row.data, dict) else {}
    found: list[str] = []
    if _is_draft(row):
        names = data.get("names")
        if isinstance(names, dict):
            found.extend(value for value in names.values() if isinstance(value, str))
        return found
    seats = data.get("seats")
    if isinstance(seats, list):
        for seat in seats:
            if not isinstance(seat, dict) or seat.get("is_hero"):
                continue
            name = seat.get("name")
            if isinstance(name, str):
                found.append(name)
    return found


def rank_opponent_names(names: list[str]) -> list[str]:
    counts: dict[str, int] = {}
    first: dict[str, int] = {}
    for index, raw in enumerate(names):
        name = " ".join(raw.split())[:16]
        if not name or name == "Вы" or _DEFAULT_SEAT_NAME.fullmatch(name):
            continue
        counts[name] = counts.get(name, 0) + 1
        first.setdefault(name, index)
    return sorted(counts, key=lambda item: (-counts[item], first[item]))[:_OPPONENT_NAMES_LIMIT]


async def list_opponent_names(session: AsyncSession, user: User) -> list[str]:
    stmt = (
        select(Hand)
        .where(Hand.user_id == user.id)
        .order_by(Hand.updated_at.desc())
        .limit(_OPPONENT_NAMES_SCAN)
    )
    rows = list(await session.scalars(stmt))
    collected: list[str] = []
    for row in rows:
        collected.extend(_collect_opponent_names(row))
    return rank_opponent_names(collected)


async def list_hand_events(session: AsyncSession, user: User) -> list[HandEventBrief]:
    stmt = (
        select(Event)
        .join(Hand, Hand.event_id == Event.id)
        .where(Hand.user_id == user.id, Hand.status == HandStatus.PUBLISHED)
        .options(selectinload(Event.series))
        .distinct()
    )
    events = list(await session.scalars(stmt))
    events.sort(key=lambda event: (event.series.name if event.series else "", event.number or 0))
    briefs: list[HandEventBrief] = []
    for event in events:
        brief = _event_brief(event)
        if brief is not None:
            briefs.append(brief)
    return briefs


async def get_hand(
    session: AsyncSession,
    slug: str,
    viewer: User | None,
    *,
    increment_views: bool = False,
) -> Hand:
    row = await _get_by_ref(session, slug)
    if row is None:
        raise NotFoundError("Раздача не найдена")
    is_owner = viewer is not None and viewer.id == row.user_id
    if _is_draft(row):
        if not is_owner:
            raise NotFoundError("Раздача не найдена")
        return row
    if not row.is_public and not is_owner:
        raise NotFoundError("Раздача не найдена")
    if increment_views and not is_owner:
        row.views_count += 1
        await session.flush()
        await session.refresh(row)
    return row


async def patch_hand(
    session: AsyncSession,
    user: User,
    ref: str,
    body: HandPatch,
) -> Hand:
    row = await _get_by_ref(session, ref)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Раздача не найдена")
    if _is_draft(row):
        return await update_draft(
            session,
            user,
            row.id,
            HandDraftUpdate(
                current_step=body.current_step,
                event_id=body.event_id,
                series_id=body.series_id,
                live_session_id=body.live_session_id,
                title=body.title,
                note=body.note,
                wizard=body.wizard,
                clear_event=body.clear_event,
                clear_series=body.clear_series,
                clear_live_session=body.clear_live_session,
                base_updated_at=body.base_updated_at,
            ),
        )
    return await update_hand(
        session,
        user,
        ref,
        HandUpdate(
            event_id=body.event_id,
            series_id=body.series_id,
            live_session_id=body.live_session_id,
            is_public=body.is_public,
            title=body.title,
            note=body.note,
            data=body.data,
            clear_event=body.clear_event,
            clear_series=body.clear_series,
            clear_live_session=body.clear_live_session,
        ),
    )


async def update_hand(
    session: AsyncSession,
    user: User,
    slug: str,
    body: HandUpdate,
) -> Hand:
    row = await _get_by_ref(session, slug)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Раздача не найдена")
    if _is_draft(row):
        raise AppError("validation_error", "Черновик сохраняйте через PATCH с wizard", 422)
    await _apply_links(
        session,
        user,
        row,
        event_id=body.event_id,
        series_id=body.series_id,
        live_session_id=body.live_session_id,
        clear_event=body.clear_event,
        clear_series=body.clear_series,
        clear_live_session=body.clear_live_session,
    )
    if body.is_public is not None:
        row.is_public = body.is_public
    if body.title is not None:
        row.title = body.title
    if body.note is not None:
        row.note = body.note
    if body.data is not None:
        row.data = body.data.model_dump(mode="json")
    await session.flush()
    return await _reload(session, row.id)


async def update_draft(
    session: AsyncSession,
    user: User,
    hand_id: UUID,
    body: HandDraftUpdate,
) -> Hand:
    row = await _get_by_id(session, hand_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Раздача не найдена")
    if not _is_draft(row):
        raise AppError("validation_error", "Опубликованную раздачу черновиком не обновить", 422)
    stale = body.base_updated_at is not None and not _same_updated_at(
        row.updated_at, body.base_updated_at
    )
    if stale:
        incoming = _wizard_payload(body.wizard, body.current_step or row.current_step or 1)
        if body.wizard is None or incoming != row.data:
            raise ConflictError(
                "Черновик изменён на другом устройстве",
                code="draft_conflict",
                server=to_read(row, user).model_dump(mode="json"),
            )
        return row
    await _apply_links(
        session,
        user,
        row,
        event_id=body.event_id,
        series_id=body.series_id,
        live_session_id=body.live_session_id,
        clear_event=body.clear_event,
        clear_series=body.clear_series,
        clear_live_session=body.clear_live_session,
    )
    if body.title is not None:
        row.title = body.title
    if body.note is not None:
        row.note = body.note
    if body.current_step is not None:
        row.current_step = body.current_step
    if body.wizard is not None:
        row.data = _wizard_payload(body.wizard, body.current_step or row.current_step or 1)
    elif body.current_step is not None:
        row.data = _wizard_payload(row.data, body.current_step)
    row.updated_at = datetime.now(UTC)
    await session.flush()
    return await _reload(session, row.id)


async def publish_draft(
    session: AsyncSession,
    user: User,
    hand_id: UUID,
    body: HandPublish,
) -> Hand:
    row = await _get_by_id(session, hand_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Раздача не найдена")
    if not _is_draft(row):
        raise ConflictError("Раздача уже опубликована")
    await _apply_links(
        session,
        user,
        row,
        event_id=body.event_id,
        series_id=body.series_id,
        live_session_id=body.live_session_id,
        clear_event=body.clear_event,
        clear_series=body.clear_series,
        clear_live_session=body.clear_live_session,
    )
    payload = body.data.model_dump(mode="json")
    row.status = HandStatus.PUBLISHED
    row.current_step = None
    row.is_public = body.is_public
    if body.title is not None:
        row.title = body.title
    if body.note is not None:
        row.note = body.note
    row.data = payload
    await session.flush()
    return await _reload(session, row.id)


async def delete_hand(session: AsyncSession, user: User, slug: str) -> None:
    row = await _get_by_ref(session, slug)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Раздача не найдена")
    await session.delete(row)
    await session.flush()


def _series_link(series: Series, *, section: LinkSection) -> HandLinkTarget:
    return HandLinkTarget(
        kind="series",
        section=section,
        series_id=series.id,
        label=f"Серия · {series.name}",
        series_name=series.name,
    )


def _event_link(
    event: Event,
    *,
    section: LinkSection,
    series: Series | None = None,
) -> HandLinkTarget:
    series_obj = series if series is not None else event.series
    return HandLinkTarget(
        kind="event",
        section=section,
        event_id=event.id,
        label=_event_label(event),
        series_name=series_obj.name if series_obj is not None else None,
    )


async def _running_series(session: AsyncSession) -> list[Series]:
    today = date.today()
    stmt = (
        select(Series)
        .where(
            Series.status.in_(_RUNNING_SERIES_STATUSES),
            Series.starts_on <= today,
            Series.ends_on >= today,
        )
        .options(selectinload(Series.events))
        .order_by(Series.starts_on.desc(), Series.name.asc())
    )
    return list(await session.scalars(stmt))


async def list_link_targets(
    session: AsyncSession,
    user: User,
    q: str | None = None,
) -> list[HandLinkTarget]:
    items: list[HandLinkTarget] = []
    seen_events: set[UUID] = set()
    seen_series: set[UUID] = set()

    active = await get_active_session(session, user)
    if active is not None:
        if active.event is not None:
            label = f"Текущий турнир · {_event_label(active.event)}"
            series_name = active.event.series.name if active.event.series else None
            event_id = active.event.id
            seen_events.add(event_id)
        else:
            extra = active.manual_name
            label = f"Текущий турнир · {extra}" if extra else "Текущий турнир"
            series_name = None
            event_id = None
        items.append(
            HandLinkTarget(
                kind="live",
                section="live",
                event_id=event_id,
                live_session_id=active.id,
                label=label,
                series_name=series_name,
            )
        )

    for candidate in await list_candidates(session, user):
        if candidate.event_id in seen_events:
            continue
        seen_events.add(candidate.event_id)
        items.append(
            HandLinkTarget(
                kind="event",
                section="today",
                event_id=candidate.event_id,
                live_session_id=None,
                label=candidate.name,
                series_name=candidate.series_name,
            )
        )

    for series in await _running_series(session):
        if series.id not in seen_series:
            seen_series.add(series.id)
            items.append(_series_link(series, section="running"))
        events = sorted(
            (event for event in series.events if event.status != EventStatus.CANCELLED),
            key=lambda event: (event.number is None, event.number or 0, event.name),
        )
        for event in events:
            if event.id in seen_events:
                continue
            seen_events.add(event.id)
            items.append(_event_link(event, section="running", series=series))

    needle = (q or "").strip()
    if not needle:
        return items
    pattern = f"%{needle}%"
    series_rows = list(
        await session.scalars(
            select(Series)
            .where(
                Series.status != SeriesStatus.CANCELLED,
                Series.name.ilike(pattern),
            )
            .order_by(Series.name.asc())
            .limit(_LINK_SEARCH_LIMIT)
        )
    )
    event_rows = list(
        await session.scalars(
            select(Event)
            .join(Series, Event.series_id == Series.id)
            .where(
                Event.status != EventStatus.CANCELLED,
                Series.status != SeriesStatus.CANCELLED,
                or_(Event.name.ilike(pattern), Series.name.ilike(pattern)),
            )
            .options(selectinload(Event.series))
            .order_by(Series.name.asc(), Event.number.asc().nulls_last(), Event.name.asc())
            .limit(_LINK_SEARCH_LIMIT)
        )
    )
    for series in series_rows:
        if series.id in seen_series:
            continue
        seen_series.add(series.id)
        items.append(_series_link(series, section="search"))
    for event in event_rows:
        if event.id in seen_events:
            continue
        seen_events.add(event.id)
        items.append(_event_link(event, section="search"))
    return items
