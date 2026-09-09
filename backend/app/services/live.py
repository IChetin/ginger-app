from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.auth import User
from app.models.enums import (
    BookmarkTarget,
    EventStatus,
    LiveEventType,
    LiveSessionStatus,
    SeriesStatus,
)
from app.models.live import LiveEvent, LiveSession
from app.models.notifications import Bookmark
from app.models.references import Currency
from app.models.schedule import Event, Flight, Series
from app.schemas.live import (
    LiveCandidateRead,
    LiveEventCreateItem,
    LiveEventRead,
    LiveEventUpdate,
    LiveSessionCreate,
    LiveSessionFinish,
    LiveSessionRead,
)
from app.schemas.results import ResultCreate
from app.schemas.schedule import CurrencyBrief
from app.services import results as results_service
from app.utils.timezone import venue_local_date


def _event_display_name(event: Event) -> str:
    if event.number is not None:
        return f"#{event.number} {event.name}"
    return event.name


def _active_events(session_row: LiveSession) -> list[LiveEvent]:
    return [item for item in session_row.events if item.deleted_at is None]


def _entries_count(session_row: LiveSession) -> int:
    return sum(
        1
        for item in _active_events(session_row)
        if item.type in (LiveEventType.ENTRY, LiveEventType.REENTRY)
    )


async def _ensure_currency(session: AsyncSession, currency_code: str) -> Currency:
    currency = await session.get(Currency, currency_code)
    if currency is None:
        raise NotFoundError(f"Currency {currency_code} not found")
    return currency


async def _load_event(session: AsyncSession, event_id: UUID) -> Event:
    event = await session.scalar(
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.currency),
            selectinload(Event.flights),
            selectinload(Event.series).selectinload(Series.venue),
        )
    )
    if event is None:
        raise NotFoundError("Event not found")
    return event


async def _load_session_row(
    session: AsyncSession,
    *,
    session_id: UUID | None = None,
    user_id: UUID | None = None,
    require_active: bool = False,
) -> LiveSession | None:
    stmt = select(LiveSession).options(
        selectinload(LiveSession.events),
        selectinload(LiveSession.event).selectinload(Event.currency),
        selectinload(LiveSession.event).selectinload(Event.series).selectinload(Series.venue),
        selectinload(LiveSession.currency),
        selectinload(LiveSession.flight),
    )
    if session_id is not None:
        stmt = stmt.where(LiveSession.id == session_id)
    if user_id is not None:
        stmt = stmt.where(LiveSession.user_id == user_id)
    if require_active:
        stmt = stmt.where(LiveSession.status == LiveSessionStatus.ACTIVE)
    return await session.scalar(stmt)


async def _ensure_initial_entry(session: AsyncSession, row: LiveSession) -> LiveSession:
    """Guarantee exactly one ENTRY: create from buy-in or promote earliest re-entry."""
    if row.status != LiveSessionStatus.ACTIVE:
        return row
    active = _active_events(row)
    if any(item.type == LiveEventType.ENTRY for item in active):
        return row

    reentries = sorted(
        (item for item in active if item.type == LiveEventType.REENTRY),
        key=lambda item: (item.occurred_at, item.created_at),
    )
    if reentries:
        reentries[0].type = LiveEventType.ENTRY
        await session.flush()
        session.expire(row, ["events"])
        loaded = await _load_session_row(session, session_id=row.id)
        return loaded or row

    if row.event is not None:
        amount = row.event.buyin
        currency_code = row.event.currency_code
    else:
        if row.manual_buyin is None or row.manual_currency is None:
            return row
        amount = row.manual_buyin
        currency_code = row.manual_currency

    session.add(
        LiveEvent(
            id=uuid4(),
            session_id=row.id,
            type=LiveEventType.ENTRY,
            amount=amount,
            currency_code=currency_code,
            occurred_at=row.started_at,
        )
    )
    await session.flush()
    session.expire(row, ["events"])
    loaded = await _load_session_row(session, session_id=row.id)
    return loaded or row


async def get_active_session(
    session: AsyncSession,
    user: User,
) -> LiveSession | None:
    row = await _load_session_row(session, user_id=user.id, require_active=True)
    if row is None:
        return None
    return await _ensure_initial_entry(session, row)


async def get_session_for_user(
    session: AsyncSession,
    user: User,
    session_id: UUID,
    *,
    require_active: bool = False,
) -> LiveSession:
    row = await _load_session_row(session, session_id=session_id, user_id=user.id)
    if row is None:
        raise NotFoundError("Live session not found")
    if require_active and row.status != LiveSessionStatus.ACTIVE:
        raise ConflictError("Live session is already closed")
    if row.status == LiveSessionStatus.ACTIVE:
        return await _ensure_initial_entry(session, row)
    return row


def to_session_read(row: LiveSession) -> LiveSessionRead:
    if row.event is not None:
        display_name = _event_display_name(row.event)
        if row.flight is not None and row.flight.label:
            display_name = f"{display_name} · {row.flight.label}"
        display_series = row.event.series.name
        buyin = row.event.buyin
        currency = CurrencyBrief(
            code=row.event.currency.code,
            symbol=row.event.currency.symbol,
        )
        reentry_allowed = bool(row.event.reentry_unlimited or (row.event.reentry_count or 0) > 0)
    else:
        display_name = row.manual_name or "Турнир"
        display_series = row.manual_venue
        buyin = row.manual_buyin or Decimal("0")
        if row.currency is None:
            currency = CurrencyBrief(code=row.manual_currency or "RUB", symbol="₽")
        else:
            currency = CurrencyBrief(code=row.currency.code, symbol=row.currency.symbol)
        reentry_allowed = True

    events = [
        LiveEventRead.model_validate(item)
        for item in sorted(
            _active_events(row),
            key=lambda item: (item.occurred_at, item.created_at),
            reverse=True,
        )
    ]
    return LiveSessionRead(
        id=row.id,
        event_id=row.event_id,
        flight_id=row.flight_id,
        manual_name=row.manual_name,
        manual_venue=row.manual_venue,
        manual_buyin=row.manual_buyin,
        manual_currency=row.manual_currency,
        started_at=row.started_at,
        finished_at=row.finished_at,
        status=row.status,
        place=row.place,
        field_size=row.field_size,
        payout=row.payout,
        result_id=row.result_id,
        display_name=display_name,
        display_series=display_series,
        buyin=buyin,
        currency=currency,
        reentry_allowed=reentry_allowed,
        events=events,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _same_linked_tournament(row: LiveSession, body: LiveSessionCreate) -> bool:
    if body.event_id is None or row.event_id is None:
        return False
    if row.event_id != body.event_id:
        return False
    if body.flight_id is None or row.flight_id is None:
        return True
    return row.flight_id == body.flight_id


async def _find_finished_with_result(
    session: AsyncSession,
    user: User,
    *,
    event_id: UUID,
    flight_id: UUID | None,
) -> LiveSession | None:
    stmt = (
        select(LiveSession)
        .where(
            LiveSession.user_id == user.id,
            LiveSession.event_id == event_id,
            LiveSession.status == LiveSessionStatus.FINISHED,
            LiveSession.result_id.is_not(None),
        )
        .order_by(LiveSession.finished_at.desc())
        .limit(1)
    )
    if flight_id is not None:
        stmt = stmt.where(
            or_(LiveSession.flight_id == flight_id, LiveSession.flight_id.is_(None))
        )
    return await session.scalar(stmt)


async def create_session(
    session: AsyncSession,
    user: User,
    body: LiveSessionCreate,
) -> tuple[LiveSession, bool]:
    existing_same = await session.get(LiveSession, body.id)
    if existing_same is not None:
        if existing_same.user_id != user.id:
            raise ConflictError("Live session id already used")
        return await get_session_for_user(session, user, body.id), False

    active = await get_active_session(session, user)
    if active is not None:
        if _same_linked_tournament(active, body):
            return active, False
        raise ConflictError(
            "Active live session already exists",
            active_session_id=str(active.id),
        )

    if body.event_id is not None:
        finished = await _find_finished_with_result(
            session,
            user,
            event_id=body.event_id,
            flight_id=body.flight_id,
        )
        if finished is not None and finished.result_id is not None:
            raise ConflictError(
                "Result for this tournament already exists",
                result_id=str(finished.result_id),
            )

    started_at = body.started_at or datetime.now(UTC)
    if started_at.tzinfo is None:
        raise AppError("validation_error", "started_at must be timezone-aware", 400)

    if body.event_id is not None:
        event = await _load_event(session, body.event_id)
        if body.flight_id is not None:
            flight = next((item for item in event.flights if item.id == body.flight_id), None)
            if flight is None:
                raise NotFoundError("Flight not found for event")
    else:
        assert body.manual_currency is not None
        await _ensure_currency(session, body.manual_currency)

    row = LiveSession(
        id=body.id,
        user_id=user.id,
        event_id=body.event_id,
        flight_id=body.flight_id,
        manual_name=body.manual_name.strip() if body.manual_name else None,
        manual_venue=body.manual_venue.strip() if body.manual_venue else None,
        manual_buyin=body.manual_buyin,
        manual_currency=body.manual_currency,
        started_at=started_at,
        status=LiveSessionStatus.ACTIVE,
    )
    session.add(row)
    await session.flush()

    if body.event_id is not None:
        entry_amount = event.buyin
        entry_currency = event.currency_code
    else:
        assert body.manual_buyin is not None
        assert body.manual_currency is not None
        entry_amount = body.manual_buyin
        entry_currency = body.manual_currency

    session.add(
        LiveEvent(
            id=uuid4(),
            session_id=row.id,
            type=LiveEventType.ENTRY,
            amount=entry_amount,
            currency_code=entry_currency,
            occurred_at=started_at,
        )
    )
    await session.flush()
    return await get_session_for_user(session, user, row.id), True


async def add_events_batch(
    session: AsyncSession,
    user: User,
    session_id: UUID,
    items: list[LiveEventCreateItem],
) -> LiveSession:
    row = await get_session_for_user(session, user, session_id, require_active=True)
    default_currency = (
        row.event.currency_code
        if row.event is not None
        else (row.manual_currency or "RUB")
    )
    has_entry = any(item.type == LiveEventType.ENTRY for item in _active_events(row))

    for item in items:
        if item.type == LiveEventType.ENTRY and has_entry:
            # Initial entry is created with the session; skip stale client duplicates.
            continue
        if item.type != LiveEventType.NOTE and item.currency_code:
            await _ensure_currency(session, item.currency_code)
        elif item.type != LiveEventType.NOTE:
            await _ensure_currency(session, default_currency)

        currency_code = None
        text = None
        amount = None
        if item.type == LiveEventType.NOTE:
            text = (item.text or "").strip()
        else:
            amount = item.amount
            currency_code = item.currency_code or default_currency

        if item.occurred_at.tzinfo is None:
            raise AppError("validation_error", "occurred_at must be timezone-aware", 400)

        stmt = (
            insert(LiveEvent)
            .values(
                id=item.id,
                session_id=session_id,
                type=item.type,
                amount=amount,
                currency_code=currency_code,
                text=text,
                occurred_at=item.occurred_at,
            )
            .on_conflict_do_nothing(index_elements=[LiveEvent.id])
        )
        await session.execute(stmt)
        if item.type == LiveEventType.ENTRY:
            has_entry = True

    await session.flush()
    session.expire(row, ["events"])
    return await get_session_for_user(session, user, session_id)


async def update_event(
    session: AsyncSession,
    user: User,
    event_id: UUID,
    body: LiveEventUpdate,
) -> LiveSession:
    event_row = await session.scalar(
        select(LiveEvent)
        .where(LiveEvent.id == event_id, LiveEvent.deleted_at.is_(None))
        .options(selectinload(LiveEvent.session))
    )
    if event_row is None or event_row.session.user_id != user.id:
        raise NotFoundError("Live event not found")
    if event_row.session.status != LiveSessionStatus.ACTIVE:
        raise ConflictError("Live session is already closed")

    if body.occurred_at is not None:
        if body.occurred_at.tzinfo is None:
            raise AppError("validation_error", "occurred_at must be timezone-aware", 400)
        event_row.occurred_at = body.occurred_at
    if event_row.type == LiveEventType.NOTE:
        if body.text is not None:
            event_row.text = body.text.strip()
    else:
        if body.amount is not None:
            event_row.amount = body.amount

    await session.flush()
    return await get_session_for_user(session, user, event_row.session_id)


async def delete_event(
    session: AsyncSession,
    user: User,
    event_id: UUID,
) -> LiveSession:
    event_row = await session.scalar(
        select(LiveEvent)
        .where(LiveEvent.id == event_id, LiveEvent.deleted_at.is_(None))
        .options(selectinload(LiveEvent.session).selectinload(LiveSession.events))
    )
    if event_row is None or event_row.session.user_id != user.id:
        raise NotFoundError("Live event not found")
    if event_row.session.status != LiveSessionStatus.ACTIVE:
        raise ConflictError("Live session is already closed")

    if event_row.type == LiveEventType.ENTRY:
        remaining_entries = sum(
            1
            for item in event_row.session.events
            if item.deleted_at is None
            and item.type == LiveEventType.ENTRY
            and item.id != event_row.id
        )
        if remaining_entries == 0:
            raise AppError(
                "validation_error",
                "Cannot delete the last entry event",
                400,
            )

    event_row.deleted_at = datetime.now(UTC)
    await session.flush()
    return await get_session_for_user(session, user, event_row.session_id)


def _played_on_for_session(row: LiveSession) -> date:
    if row.event is not None:
        tz = row.event.series.venue.timezone
        if row.flight is not None:
            return venue_local_date(row.flight.start_at, tz)
        return venue_local_date(row.started_at, tz)
    if row.started_at.tzinfo is None:
        return row.started_at.date()
    return row.started_at.astimezone(ZoneInfo("UTC")).date()


async def finish_session(
    session: AsyncSession,
    user: User,
    session_id: UUID,
    body: LiveSessionFinish,
) -> LiveSession:
    row = await get_session_for_user(session, user, session_id)
    if row.status == LiveSessionStatus.FINISHED and row.result_id is not None:
        return row
    if row.status != LiveSessionStatus.ACTIVE:
        raise ConflictError("Live session is already closed")

    entries = _entries_count(row)
    if entries < 1:
        raise AppError("validation_error", "Session needs at least one entry", 400)

    payout = Decimal("0") if not body.in_the_money else body.payout
    place = None if not body.in_the_money else body.place
    field_size = None if not body.in_the_money else body.field_size

    if row.event_id is not None:
        result_body = ResultCreate(
            event_id=row.event_id,
            played_on=_played_on_for_session(row),
            entries_count=entries,
            payout=payout,
            place=place,
            field_size=field_size,
        )
    else:
        result_body = ResultCreate(
            name=row.manual_name,
            venue_text=row.manual_venue,
            played_on=_played_on_for_session(row),
            buyin=row.manual_buyin,
            currency_code=row.manual_currency,
            entries_count=entries,
            payout=payout,
            place=place,
            field_size=field_size,
        )

    result = await results_service.create_result(session, user, result_body)
    await results_service.copy_live_events_to_result(session, result, _active_events(row))
    row.result_id = result.id
    row.place = place
    row.field_size = field_size
    row.payout = payout
    row.status = LiveSessionStatus.FINISHED
    row.finished_at = datetime.now(UTC)
    await session.flush()
    return await get_session_for_user(session, user, session_id)


async def cancel_session(
    session: AsyncSession,
    user: User,
    session_id: UUID,
) -> LiveSession:
    row = await get_session_for_user(session, user, session_id)
    if row.status == LiveSessionStatus.CANCELLED:
        return row
    if row.status != LiveSessionStatus.ACTIVE:
        raise ConflictError("Live session is already closed")
    row.status = LiveSessionStatus.CANCELLED
    row.finished_at = datetime.now(UTC)
    await session.flush()
    return await get_session_for_user(session, user, session_id)


async def list_candidates(
    session: AsyncSession,
    user: User,
    *,
    include_event_id: UUID | None = None,
    include_flight_id: UUID | None = None,
) -> list[LiveCandidateRead]:
    """Today's flights from bookmarks, «Идут» series (effective phase), or explicit ids.

    Effective «running» matches home feed: status announced|schedule_published|running
    and starts_on ≤ today ≤ ends_on (server date).
    """
    bookmarks = list(
        await session.scalars(select(Bookmark).where(Bookmark.user_id == user.id))
    )
    series_ids = {b.target_id for b in bookmarks if b.target_type == BookmarkTarget.SERIES}
    flight_ids = {b.target_id for b in bookmarks if b.target_type == BookmarkTarget.FLIGHT}

    today = date.today()
    scope_filters = [
        and_(
            Series.status.in_(
                (
                    SeriesStatus.ANNOUNCED,
                    SeriesStatus.SCHEDULE_PUBLISHED,
                    SeriesStatus.RUNNING,
                )
            ),
            Series.starts_on <= today,
            Series.ends_on >= today,
        )
    ]
    if series_ids:
        scope_filters.append(Series.id.in_(series_ids))
    if flight_ids:
        scope_filters.append(Flight.id.in_(flight_ids))
    if include_event_id is not None:
        scope_filters.append(Event.id == include_event_id)
    if include_flight_id is not None:
        scope_filters.append(Flight.id == include_flight_id)

    flights_stmt = (
        select(Flight)
        .join(Event, Flight.event_id == Event.id)
        .join(Series, Event.series_id == Series.id)
        .where(
            Series.status.in_(
                (
                    SeriesStatus.ANNOUNCED,
                    SeriesStatus.SCHEDULE_PUBLISHED,
                    SeriesStatus.RUNNING,
                    SeriesStatus.FINISHED,
                )
            ),
            Event.status != EventStatus.CANCELLED,
            or_(*scope_filters),
        )
        .options(
            selectinload(Flight.event).selectinload(Event.currency),
            selectinload(Flight.event).selectinload(Event.series).selectinload(Series.venue),
        )
        .order_by(Flight.start_at.asc())
    )
    flights = list(await session.scalars(flights_stmt))

    candidates: list[LiveCandidateRead] = []
    seen: set[UUID] = set()
    for flight in flights:
        event = flight.event
        venue_tz = event.series.venue.timezone
        venue_today = datetime.now(ZoneInfo(venue_tz)).date()
        if venue_local_date(flight.start_at, venue_tz) != venue_today:
            continue
        if flight.id in seen:
            continue
        seen.add(flight.id)
        candidates.append(
            LiveCandidateRead(
                event_id=event.id,
                flight_id=flight.id,
                name=_event_display_name(event)
                + (f" · {flight.label}" if flight.label else ""),
                series_name=event.series.name,
                buyin=event.buyin,
                currency=CurrencyBrief(
                    code=event.currency.code,
                    symbol=event.currency.symbol,
                ),
                start_at=flight.start_at,
                reentry_count=event.reentry_count,
                reentry_unlimited=event.reentry_unlimited,
            )
        )
    return candidates
