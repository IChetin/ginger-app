from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.enums import EntryType, LiveEventType, SeriesStatus
from app.models.live import LiveEvent
from app.models.references import Currency
from app.models.schedule import Event, Flight, Series
from app.models.tracker import Result, ResultEvent
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.results import (
    ResultCreate,
    ResultEventSearchItem,
    ResultEventWrite,
    ResultListItem,
    ResultUpdate,
)
from app.schemas.schedule import CurrencyBrief
from app.schemas.stats import StatsFilterParams
from app.services import stats as stats_service
from app.utils.timezone import venue_local_date

_PUBLISHED_SERIES = {
    SeriesStatus.ANNOUNCED,
    SeriesStatus.SCHEDULE_PUBLISHED,
    SeriesStatus.RUNNING,
    SeriesStatus.FINISHED,
}

_MONEY_TYPES = {LiveEventType.ENTRY, LiveEventType.REENTRY}


def _validate_place_field(place: int | None, field_size: int | None) -> None:
    if place is not None and field_size is not None and place > field_size:
        raise AppError(
            "validation_error",
            "place must be less than or equal to field_size",
            400,
        )


def _calendar_today(*, timezone_name: str | None = None) -> date:
    if timezone_name:
        try:
            return datetime.now(ZoneInfo(timezone_name)).date()
        except ZoneInfoNotFoundError:
            pass
    return datetime.now(UTC).date()


def _validate_played_on(played_on: date, *, timezone_name: str | None = None) -> None:
    """Reject dates after 'today' in the given IANA zone (venue/user), else UTC."""
    today = _calendar_today(timezone_name=timezone_name)
    if played_on > today:
        raise AppError("validation_error", "played_on cannot be in the future", 400)


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


def _default_played_on_from_event(event: Event) -> date:
    if not event.flights:
        return datetime.now(UTC).date()
    earliest = min(event.flights, key=lambda item: item.start_at)
    return venue_local_date(earliest.start_at, event.series.venue.timezone)


def _event_name(event: Event) -> str:
    if event.number is not None:
        return f"#{event.number} {event.name}"
    return event.name


def _noon_utc(played_on: date) -> datetime:
    return datetime(played_on.year, played_on.month, played_on.day, 12, 0, tzinfo=UTC)


def _entries_from_events(events: list[ResultEvent] | list[ResultEventWrite]) -> int:
    return sum(1 for item in events if item.type in _MONEY_TYPES)


def _validate_events_snapshot(events: list[ResultEventWrite]) -> None:
    if not events:
        raise AppError("validation_error", "events must not be empty", 400)
    entry_count = sum(1 for item in events if item.type == LiveEventType.ENTRY)
    if entry_count != 1:
        raise AppError("validation_error", "Exactly one entry event is required", 400)
    if _entries_from_events(events) < 1:
        raise AppError("validation_error", "At least one money event is required", 400)
    ids = [item.id for item in events]
    if len(ids) != len(set(ids)):
        raise AppError("validation_error", "Duplicate event ids", 400)


def _default_events_write(
    *,
    buyin: Decimal,
    currency_code: str,
    entries_count: int,
    played_on: date,
    note: str | None,
) -> list[ResultEventWrite]:
    base = _noon_utc(played_on)
    items: list[ResultEventWrite] = [
        ResultEventWrite(
            id=uuid.uuid4(),
            type=LiveEventType.ENTRY,
            amount=buyin,
            currency_code=currency_code,
            occurred_at=base,
        )
    ]
    for index in range(1, entries_count):
        items.append(
            ResultEventWrite(
                id=uuid.uuid4(),
                type=LiveEventType.REENTRY,
                amount=buyin,
                currency_code=currency_code,
                occurred_at=base + timedelta(minutes=index),
            )
        )
    if note and note.strip():
        items.append(
            ResultEventWrite(
                id=uuid.uuid4(),
                type=LiveEventType.NOTE,
                text=note.strip()[:500],
                occurred_at=base + timedelta(minutes=30),
            )
        )
    return items


async def _replace_result_events(
    session: AsyncSession,
    result: Result,
    events: list[ResultEventWrite],
) -> None:
    _validate_events_snapshot(events)
    for item in events:
        if item.currency_code is not None:
            await _ensure_currency(session, item.currency_code)
        elif item.type in _MONEY_TYPES:
            item.currency_code = result.currency_code

    # Keep collection loaded in-memory so autoflush/delete never async-lazy-loads.
    set_committed_value(result, "events", [])
    await session.execute(
        delete(ResultEvent).where(ResultEvent.result_id == result.id),
        execution_options={"synchronize_session": False},
    )
    await session.flush()
    for item in events:
        result.events.append(
            ResultEvent(
                id=item.id,
                result_id=result.id,
                type=item.type,
                amount=item.amount,
                currency_code=item.currency_code,
                text=item.text.strip() if item.text else None,
                occurred_at=item.occurred_at,
            )
        )
    result.entries_count = _entries_from_events(events)
    await session.flush()


def _rebuild_money_events(
    result: Result,
    *,
    entries_count: int,
) -> list[ResultEventWrite]:
    """Keep notes; rebuild entry/reentry from buyin when entries_count changes without events."""
    notes = [
        ResultEventWrite(
            id=item.id,
            type=LiveEventType.NOTE,
            text=item.text,
            occurred_at=item.occurred_at,
        )
        for item in result.events
        if item.type == LiveEventType.NOTE and item.text
    ]
    money = _default_events_write(
        buyin=result.buyin,
        currency_code=result.currency_code,
        entries_count=entries_count,
        played_on=result.played_on,
        note=None,
    )
    return money + notes


async def copy_live_events_to_result(
    session: AsyncSession,
    result: Result,
    live_events: list[LiveEvent],
) -> None:
    """Replace result chronology with a copy of active live events (new ids)."""
    writes = [
        ResultEventWrite(
            id=uuid.uuid4(),
            type=item.type,
            amount=item.amount,
            currency_code=item.currency_code,
            text=item.text,
            occurred_at=item.occurred_at,
        )
        for item in live_events
    ]
    await _replace_result_events(session, result, writes)


async def list_results(
    session: AsyncSession,
    user: User,
    pagination: PaginationParams,
    filters: StatsFilterParams,
) -> PaginatedResponse[ResultListItem]:
    selected = await stats_service.select_converted_results(session, user, filters)
    selected.sort(
        key=lambda item: (item[0].played_on, item[0].created_at, item[0].id),
        reverse=True,
    )
    total = len(selected)
    page = selected[pagination.offset : pagination.offset + pagination.limit]
    items: list[ResultListItem] = []
    for row, invested, won in page:
        items.append(
            ResultListItem.model_validate(
                {
                    **{
                        column.name: getattr(row, column.name)
                        for column in Result.__table__.columns
                        if column.name != "user_id"
                    },
                    "events": [],
                    "profit_base": (won - invested).quantize(Decimal("0.01")),
                    "base_currency": user.base_currency,
                }
            )
        )
    return PaginatedResponse(
        items=items,
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def search_past_events(
    session: AsyncSession,
    *,
    query: str,
    limit: int,
) -> list[ResultEventSearchItem]:
    now = datetime.now(UTC)
    statement = (
        select(Event)
        .join(Event.series)
        .where(
            Series.status.in_(_PUBLISHED_SERIES),
            Event.flights.any(Flight.start_at <= now),
        )
        .options(
            selectinload(Event.currency),
            selectinload(Event.flights),
            selectinload(Event.series).selectinload(Series.venue),
        )
        .order_by(Series.starts_on.desc(), Event.number.asc().nullslast(), Event.name.asc())
        .limit(limit)
    )
    normalized = query.strip()
    if normalized:
        pattern = f"%{normalized}%"
        statement = statement.where(or_(Event.name.ilike(pattern), Series.name.ilike(pattern)))

    events = list(await session.scalars(statement))
    return [
        ResultEventSearchItem(
            event_id=event.id,
            name=_event_name(event),
            series_name=event.series.name,
            venue_name=event.series.venue.name,
            played_on=_default_played_on_from_event(event),
            buyin=event.buyin,
            currency_code=event.currency.code,
            currency_symbol=event.currency.symbol,
        )
        for event in events
    ]


async def list_result_currencies(session: AsyncSession) -> list[CurrencyBrief]:
    currencies = list(await session.scalars(select(Currency).order_by(Currency.code.asc())))
    return [CurrencyBrief(code=item.code, symbol=item.symbol) for item in currencies]


async def get_user_result(
    session: AsyncSession,
    user: User,
    result_id: UUID,
) -> Result:
    result = await session.scalar(
        select(Result)
        .where(Result.id == result_id, Result.user_id == user.id)
        .options(selectinload(Result.events))
    )
    if result is None:
        raise NotFoundError("Result not found")
    return result


async def create_result(
    session: AsyncSession,
    user: User,
    body: ResultCreate,
) -> Result:
    _validate_place_field(body.place, body.field_size)

    if body.event_id is not None:
        event = await _load_event(session, body.event_id)
        venue_tz = event.series.venue.timezone
        if body.played_on is None:
            played_on = _default_played_on_from_event(event)
            if played_on > _calendar_today(timezone_name=venue_tz):
                raise AppError(
                    "validation_error",
                    "played_on is required when the event start date is in the future",
                    400,
                )
        else:
            played_on = body.played_on
        _validate_played_on(played_on, timezone_name=venue_tz)
        result = Result(
            user_id=user.id,
            entry_type=EntryType.LIVE_MTT,
            event_id=event.id,
            name=_event_name(event),
            venue_text=event.series.venue.name,
            series_text=event.series.name,
            played_on=played_on,
            buyin=event.buyin,
            currency_code=event.currency_code,
            entries_count=body.entries_count,
            payout=body.payout,
            place=body.place,
            field_size=body.field_size,
            note=body.note,
        )
        session.add(result)
        await session.flush()
        events = body.events
        if events is None:
            events = _default_events_write(
                buyin=result.buyin,
                currency_code=result.currency_code,
                entries_count=body.entries_count,
                played_on=result.played_on,
                note=body.note,
            )
        await _replace_result_events(session, result, events)
        return await get_user_result(session, user, result.id)

    if (
        body.name is None
        or body.played_on is None
        or body.buyin is None
        or body.currency_code is None
    ):
        raise AppError(
            "validation_error",
            "Manual result requires name, played_on, buyin and currency_code",
            400,
        )
    _validate_played_on(body.played_on, timezone_name=user.timezone)
    await _ensure_currency(session, body.currency_code)
    result = Result(
        user_id=user.id,
        entry_type=EntryType.LIVE_MTT,
        event_id=None,
        name=body.name.strip(),
        venue_text=body.venue_text.strip() if body.venue_text else None,
        series_text=body.series_text.strip() if body.series_text else None,
        played_on=body.played_on,
        buyin=body.buyin,
        currency_code=body.currency_code,
        entries_count=body.entries_count,
        payout=body.payout,
        place=body.place,
        field_size=body.field_size,
        note=body.note,
    )
    session.add(result)
    await session.flush()
    events = body.events
    if events is None:
        events = _default_events_write(
            buyin=result.buyin,
            currency_code=result.currency_code,
            entries_count=body.entries_count,
            played_on=result.played_on,
            note=body.note,
        )
    await _replace_result_events(session, result, events)
    return await get_user_result(session, user, result.id)


async def update_result(
    session: AsyncSession,
    user: User,
    result_id: UUID,
    body: ResultUpdate,
) -> Result:
    result = await get_user_result(session, user, result_id)
    payload = body.model_dump(exclude_unset=True)
    events_payload = payload.pop("events", None)
    events_provided = "events" in body.model_fields_set

    if result.event_id is not None:
        # Linked results: snapshot fields are immutable; allow operational fields only.
        forbidden = {"name", "venue_text", "series_text", "buyin", "currency_code"}
        blocked = forbidden.intersection(payload)
        if blocked:
            raise AppError(
                "validation_error",
                "Linked result snapshot fields cannot be changed",
                400,
            )

    place = payload.get("place", result.place)
    field_size = payload.get("field_size", result.field_size)
    _validate_place_field(place, field_size)

    if "played_on" in payload and payload["played_on"] is not None:
        tz_name: str | None = user.timezone
        if result.event_id is not None:
            event = await _load_event(session, result.event_id)
            tz_name = event.series.venue.timezone
        _validate_played_on(payload["played_on"], timezone_name=tz_name)

    if "currency_code" in payload and payload["currency_code"] is not None:
        await _ensure_currency(session, payload["currency_code"])

    for field, value in payload.items():
        if isinstance(value, str) and field in {"name", "venue_text", "series_text", "note"}:
            value = value.strip() or None if field != "name" else value.strip()
        setattr(result, field, value)

    if events_provided:
        if events_payload is None:
            raise AppError("validation_error", "events must not be null", 400)
        writes = [ResultEventWrite.model_validate(item) for item in events_payload]
        await _replace_result_events(session, result, writes)
    elif "entries_count" in payload and payload["entries_count"] is not None:
        writes = _rebuild_money_events(result, entries_count=payload["entries_count"])
        await _replace_result_events(session, result, writes)

    await session.flush()
    return await get_user_result(session, user, result.id)


async def delete_result(
    session: AsyncSession,
    user: User,
    result_id: UUID,
) -> None:
    result = await get_user_result(session, user, result_id)
    await session.delete(result)
    await session.flush()
