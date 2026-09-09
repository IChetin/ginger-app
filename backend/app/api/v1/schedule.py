from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_optional_user
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.enums import GameType, SeriesStatus
from app.schemas.schedule import (
    CalendarQuery,
    CalendarResponse,
    EventDetail,
    ScheduleFilterCountsResponse,
    ScheduleFiltersResponse,
    SeriesDetail,
    SeriesListQuery,
    SeriesListResponse,
    SeriesScheduleResponse,
)
from app.services import schedule as schedule_service
from app.services.buyin_presets import parse_buyin_presets

router = APIRouter(tags=["schedule"])


def _split_csv(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    return parts or None


def _parse_uuid_csv(raw: str | None) -> list[UUID] | None:
    parts = _split_csv(raw)
    if not parts:
        return None
    return [UUID(part) for part in parts]


def _series_list_query(
    *,
    country_code: str | None,
    country: str | None,
    countries: str | None,
    zone: str | None,
    organizer_id: UUID | None,
    organizer: UUID | None,
    organizers: str | None,
    venues: str | None,
    status: str | None,
    starts_from: date | None,
    starts_to: date | None,
    buyin_min: Decimal | None,
    buyin_max: Decimal | None,
    max_buyin: Decimal | None,
    buyin: str | None,
    base_currency: str,
    game_type: GameType | None,
    tags: list[str] | None,
    limit: int,
    offset: int,
) -> SeriesListQuery:
    country_codes = _split_csv(countries)
    if country_codes:
        country_codes = [code.upper() for code in country_codes]
    organizer_ids = _parse_uuid_csv(organizers)
    venue_ids = _parse_uuid_csv(venues)
    return SeriesListQuery(
        country_code=(country_code or country),
        country_codes=country_codes,
        zone=zone,
        organizer_id=organizer_id or organizer,
        organizer_ids=organizer_ids,
        venue_ids=venue_ids,
        status=status,
        starts_from=starts_from,
        starts_to=starts_to,
        buyin_min=buyin_min,
        buyin_max=buyin_max if buyin_max is not None else max_buyin,
        buyin_presets=parse_buyin_presets(buyin) or None,
        base_currency=base_currency.upper(),
        game_type=game_type,
        tags=tags,
        limit=limit,
        offset=offset,
    )


@router.get("/series", response_model=SeriesListResponse)
async def list_series(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User | None, Depends(get_optional_user)],
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    country: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    countries: Annotated[str | None, Query(description="Comma-separated ISO country codes")] = None,
    zone: Annotated[str | None, Query()] = None,
    organizer_id: Annotated[UUID | None, Query()] = None,
    organizer: Annotated[UUID | None, Query()] = None,
    organizers: Annotated[str | None, Query(description="Comma-separated organizer UUIDs")] = None,
    venues: Annotated[str | None, Query(description="Comma-separated venue UUIDs")] = None,
    status: Annotated[str | None, Query()] = None,
    starts_from: Annotated[date | None, Query()] = None,
    starts_to: Annotated[date | None, Query()] = None,
    buyin_min: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin_max: Annotated[Decimal | None, Query(ge=0)] = None,
    max_buyin: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin: Annotated[
        str | None, Query(description="Comma-separated presets: lt10k,10-50k,gte50k")
    ] = None,
    game_type: Annotated[GameType | None, Query()] = None,
    tags: Annotated[list[str] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SeriesListResponse:
    base_currency = user.base_currency if user is not None else "RUB"
    query = _series_list_query(
        country_code=country_code,
        country=country,
        countries=countries,
        zone=zone,
        organizer_id=organizer_id,
        organizer=organizer,
        organizers=organizers,
        venues=venues,
        status=status,
        starts_from=starts_from,
        starts_to=starts_to,
        buyin_min=buyin_min,
        buyin_max=buyin_max,
        max_buyin=max_buyin,
        buyin=buyin,
        base_currency=base_currency,
        game_type=game_type,
        tags=tags,
        limit=limit,
        offset=offset,
    )
    return await schedule_service.list_series(db, query)


@router.get("/series/filters", response_model=ScheduleFiltersResponse)
async def series_filters(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduleFiltersResponse:
    return await schedule_service.get_schedule_filters(db)


@router.get("/series/filter-counts", response_model=ScheduleFilterCountsResponse)
async def series_filter_counts(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User | None, Depends(get_optional_user)],
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    country: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    countries: Annotated[str | None, Query()] = None,
    zone: Annotated[str | None, Query()] = None,
    organizer_id: Annotated[UUID | None, Query()] = None,
    organizer: Annotated[UUID | None, Query()] = None,
    organizers: Annotated[str | None, Query()] = None,
    venues: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    starts_from: Annotated[date | None, Query()] = None,
    starts_to: Annotated[date | None, Query()] = None,
    buyin_min: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin_max: Annotated[Decimal | None, Query(ge=0)] = None,
    max_buyin: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin: Annotated[str | None, Query()] = None,
    game_type: Annotated[GameType | None, Query()] = None,
    tags: Annotated[list[str] | None, Query()] = None,
) -> ScheduleFilterCountsResponse:
    base_currency = user.base_currency if user is not None else "RUB"
    query = _series_list_query(
        country_code=country_code,
        country=country,
        countries=countries,
        zone=zone,
        organizer_id=organizer_id,
        organizer=organizer,
        organizers=organizers,
        venues=venues,
        status=status,
        starts_from=starts_from,
        starts_to=starts_to,
        buyin_min=buyin_min,
        buyin_max=buyin_max,
        max_buyin=max_buyin,
        buyin=buyin,
        base_currency=base_currency,
        game_type=game_type,
        tags=tags,
        limit=1,
        offset=0,
    )
    return await schedule_service.get_schedule_filter_counts(db, query)


@router.get("/series/{series_id}", response_model=SeriesDetail)
async def get_series(
    series_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SeriesDetail:
    return await schedule_service.get_series_detail(db, series_id)


@router.get("/series/{series_id}/schedule", response_model=SeriesScheduleResponse)
async def get_series_schedule(
    series_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    include_blinds: Annotated[bool, Query()] = False,
) -> SeriesScheduleResponse:
    from app.services.pdf import schedule_pdf as schedule_pdf_service

    return await schedule_pdf_service.get_series_schedule(
        db,
        series_id,
        include_blinds=include_blinds,
    )


@router.get("/series/{series_id}/schedule.pdf")
async def get_series_schedule_pdf(
    series_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    from app.services import slugs as slugs_service
    from app.services.pdf import schedule_pdf as schedule_pdf_service

    resolved_id = await slugs_service.resolve_series_id(db, series_id)
    client_ip = request.client.host if request.client else "unknown"
    pdf_bytes, filename, cache_hit = await schedule_pdf_service.get_series_schedule_pdf(
        db,
        resolved_id,
        client_ip=client_ip,
    )
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-PDF-Cache": "HIT" if cache_hit else "MISS",
        "Cache-Control": "private, max-age=60",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/events/{event_id}", response_model=EventDetail)
async def get_event(
    event_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventDetail:
    return await schedule_service.get_event_detail(db, event_id)


@router.get("/calendar", response_model=CalendarResponse)
async def get_calendar(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User | None, Depends(get_optional_user)],
    month: Annotated[str, Query(pattern=r"^\d{4}-\d{2}$")],
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: Annotated[date | None, Query()] = None,
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    zone: Annotated[str | None, Query()] = None,
    organizer_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[SeriesStatus | None, Query()] = None,
    buyin_min: Annotated[Decimal | None, Query(ge=0)] = None,
    buyin_max: Annotated[Decimal | None, Query(ge=0)] = None,
    game_type: Annotated[GameType | None, Query()] = None,
    tags: Annotated[list[str] | None, Query()] = None,
) -> CalendarResponse:
    if (from_ is None) ^ (to is None):
        raise AppError(
            "validation_error",
            "from and to must be provided together",
            status_code=422,
        )
    query = CalendarQuery(
        month=month,
        from_=from_,
        to=to,
        country_code=country_code,
        zone=zone,
        organizer_id=organizer_id,
        status=status,
        buyin_min=buyin_min,
        buyin_max=buyin_max,
        game_type=game_type,
        tags=tags,
    )
    return await schedule_service.get_calendar(db, query, user=user)
