"""Series full-schedule view-model and PDF generation."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import io
import logging
import time
from datetime import UTC, date, datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo

import qrcode
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError, RateLimitError
from app.models.references import Venue
from app.models.schedule import BlindLevel, Event, Flight, Series
from app.schemas.schedule import (
    BlindLevelRead,
    CountryBrief,
    CurrencyBrief,
    DateTimeWithTimezone,
    OrganizerBrief,
    SeriesScheduleDay,
    SeriesScheduleResponse,
    SeriesScheduleRow,
    VenueBrief,
)
from app.services.organizer_logo import organizer_logo_url
from app.services.pdf.filename import pdf_filename
from app.services.pdf.highlight import (
    classify_highlight,
    format_buyin_display,
    format_level_duration,
    format_money_plain,
    is_closed_event,
    pdf_tags_for_event,
    resolve_late_reg_level,
)
from app.utils.plural import tournaments_word
from app.utils.timezone import to_venue_local, venue_local_date

logger = logging.getLogger(__name__)

PACKAGE_ROOT = Path(__file__).resolve().parents[2]  # backend/app
TEMPLATES_DIR = PACKAGE_ROOT / "templates" / "pdf"
FONTS_DIR = PACKAGE_ROOT / "static" / "fonts"
KEY_STRUCTURES_MAX_EVENTS = 25

_MONTHS_RU = (
    "",
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
_WEEKDAYS_RU = (
    "понедельник",
    "вторник",
    "среда",
    "четверг",
    "пятница",
    "суббота",
    "воскресенье",
)

_pdf_hits: dict[str, list[float]] = {}


def _utc_offset_label(timezone_name: str) -> str:
    now = datetime.now(ZoneInfo(timezone_name))
    offset = now.utcoffset()
    if offset is None:
        return "UTC"
    total = int(offset.total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    hours, rem = divmod(total, 3600)
    minutes = rem // 60
    if minutes:
        return f"UTC{sign}{hours}:{minutes:02d}"
    return f"UTC{sign}{hours}"


def _day_sticky_label(day: date) -> str:
    weekday = _WEEKDAYS_RU[day.weekday()].capitalize()
    return f"{weekday}, {day.day} {_MONTHS_RU[day.month]}"


def _day_band_label(day: date) -> str:
    weekday = _WEEKDAYS_RU[day.weekday()]
    return f"{day.day:02d} {_MONTHS_RU[day.month]} · {weekday}"


def _format_date_range(starts: date, ends: date) -> str:
    if starts == ends:
        return f"{starts.day} {_MONTHS_RU[starts.month]} {starts.year}"
    if starts.month == ends.month and starts.year == ends.year:
        return f"{starts.day}–{ends.day} {_MONTHS_RU[starts.month]} {starts.year}"
    if starts.year == ends.year:
        return (
            f"{starts.day} {_MONTHS_RU[starts.month]} – "
            f"{ends.day} {_MONTHS_RU[ends.month]} {starts.year}"
        )
    return (
        f"{starts.day} {_MONTHS_RU[starts.month]} {starts.year} – "
        f"{ends.day} {_MONTHS_RU[ends.month]} {ends.year}"
    )


def _build_datetime(utc_dt: datetime, venue_timezone: str) -> DateTimeWithTimezone:
    return DateTimeWithTimezone(
        utc=utc_dt,
        venue_local=to_venue_local(utc_dt, venue_timezone),
        venue_timezone=venue_timezone,
    )


def _currency_brief(event: Event) -> CurrencyBrief:
    return CurrencyBrief(code=event.currency.code, symbol=event.currency.symbol)


def _venue_brief(venue: Venue) -> VenueBrief:
    return VenueBrief(
        id=venue.id,
        name=venue.name,
        city=venue.city,
        country_code=venue.country_code,
        zone=venue.zone,
        timezone=venue.timezone,
        address=venue.address,
    )


def _country_brief(country: object) -> CountryBrief:
    return CountryBrief(code=country.code, name_ru=country.name_ru)  # type: ignore[attr-defined]


def _organizer_brief(organizer: object) -> OrganizerBrief:
    return OrganizerBrief(
        id=organizer.id,  # type: ignore[attr-defined]
        name=organizer.name,  # type: ignore[attr-defined]
        slug=organizer.slug,  # type: ignore[attr-defined]
        logo_url=organizer_logo_url(organizer),  # type: ignore[arg-type]
    )


def _structure_set_for_flight(flight: Flight, levels: list[BlindLevel]) -> str | None:
    if not levels:
        return None
    label = (flight.label or "").strip()
    if not label:
        return None
    candidates = {level.structure_set_label for level in levels}
    compact = label.replace(" ", "").replace("-", "").upper()
    for candidate in candidates:
        cand = candidate.replace(" ", "").upper()
        if cand == compact or compact.endswith(cand) or cand in compact:
            return candidate
    return None


async def _load_series(session: AsyncSession, series_key: UUID | str) -> Series:
    from app.services import slugs as slugs_service

    series_id = (
        series_key
        if isinstance(series_key, UUID)
        else await slugs_service.resolve_series_id(session, series_key)
    )
    stmt = (
        select(Series)
        .where(Series.id == series_id)
        .options(
            selectinload(Series.organizer),
            selectinload(Series.venue).selectinload(Venue.country),
            selectinload(Series.events).selectinload(Event.currency),
            selectinload(Series.events).selectinload(Event.flights),
            selectinload(Series.events).selectinload(Event.blind_levels),
        )
    )
    series = await session.scalar(stmt)
    if series is None:
        raise NotFoundError("Series not found")
    return series


async def content_version(session: AsyncSession, series_id: UUID) -> str:
    series_ts = await session.scalar(select(Series.updated_at).where(Series.id == series_id))
    if series_ts is None:
        raise NotFoundError("Series not found")
    event_ts = await session.scalar(
        select(func.max(Event.updated_at)).where(Event.series_id == series_id)
    )
    stamps = [series_ts]
    if event_ts is not None:
        stamps.append(event_ts)
    latest = max(stamps).astimezone(UTC).isoformat()
    return hashlib.sha1(f"{series_id}:{latest}".encode()).hexdigest()[:16]


def _build_rows(
    series: Series,
    *,
    include_blinds: bool,
) -> tuple[
    list[SeriesScheduleDay],
    dict[str, list[BlindLevelRead]],
    Decimal | None,
    CurrencyBrief | None,
]:
    venue_tz = series.venue.timezone
    buckets: dict[date, list[tuple[datetime, SeriesScheduleRow]]] = {}
    blinds_by_event: dict[str, list[BlindLevelRead]] = {}
    total_guarantee = Decimal("0")
    has_guarantee = False
    currency: CurrencyBrief | None = None

    for event in series.events:
        if not event.flights:
            continue
        if currency is None:
            currency = _currency_brief(event)
        if event.guarantee is not None:
            total_guarantee += event.guarantee
            has_guarantee = True

        levels = list(event.blind_levels)
        tags_pdf = pdf_tags_for_event(
            name=event.name,
            tags=list(event.tags),
            game_type=event.game_type.value,
        )
        late_reg = resolve_late_reg_level(event)

        if include_blinds and levels:
            ordered_levels = sorted(
                levels,
                key=lambda item: (item.structure_set_label or "default", item.level_no),
            )
            blinds_by_event[str(event.id)] = [
                BlindLevelRead.model_validate(level) for level in ordered_levels
            ]

        for flight in event.flights:
            closed = is_closed_event(name=event.name, flight_label=flight.label)
            highlight = classify_highlight(
                name=event.name,
                buyin=event.buyin,
                guarantee=event.guarantee,
                tags=list(event.tags),
                flight_label=flight.label,
            )
            day = venue_local_date(flight.start_at, venue_tz)
            struct = _structure_set_for_flight(flight, levels)
            duration = format_level_duration(levels, structure_set=struct)
            start = _build_datetime(flight.start_at, venue_tz)
            row = SeriesScheduleRow(
                event_id=event.id,
                event_slug=event.slug,
                flight_id=flight.id,
                number=event.number,
                name=event.name,
                flight_label=flight.label,
                start_at=start,
                buyin=format(event.buyin, "f"),
                buyin_bounty=(
                    format(event.buyin_bounty, "f") if event.buyin_bounty is not None else None
                ),
                buyin_display=format_buyin_display(
                    buyin=event.buyin,
                    buyin_bounty=event.buyin_bounty,
                    closed=closed,
                ),
                guarantee=format(event.guarantee, "f") if event.guarantee is not None else None,
                guarantee_display=(
                    format_money_plain(event.guarantee) if event.guarantee is not None else None
                ),
                game_type=event.game_type,
                tags=list(event.tags),
                pdf_tags=tags_pdf,
                start_stack=event.start_stack,
                late_reg_level=late_reg,
                level_duration=duration,
                day_end_note=event.day_end_note,
                highlight=highlight,
                status=event.status,
            )
            buckets.setdefault(day, []).append((flight.start_at, row))

    days: list[SeriesScheduleDay] = []
    for day in sorted(buckets):
        items = buckets[day]
        items.sort(key=lambda pair: (pair[0], pair[1].number or 10_000, pair[1].name))
        days.append(
            SeriesScheduleDay(
                date=day,
                label=_day_sticky_label(day),
                band_label=_day_band_label(day),
                events_count=len(items),
                rows=[pair[1] for pair in items],
            )
        )
    return days, blinds_by_event, (total_guarantee if has_guarantee else None), currency


async def get_series_schedule(
    session: AsyncSession,
    series_id: UUID | str,
    *,
    include_blinds: bool = False,
) -> SeriesScheduleResponse:
    series = await _load_series(session, series_id)
    days, blinds_by_event, total_guarantee, currency = _build_rows(
        series,
        include_blinds=include_blinds,
    )
    events_count = sum(len(day.rows) for day in days)
    return SeriesScheduleResponse(
        id=series.id,
        slug=series.slug,
        name=series.name,
        starts_on=series.starts_on,
        ends_on=series.ends_on,
        status=series.status,
        poster_url=series.poster_url,
        organizer=_organizer_brief(series.organizer),
        venue=_venue_brief(series.venue),
        country=_country_brief(series.venue.country),
        currency=currency,
        total_guarantee=format(total_guarantee, "f") if total_guarantee is not None else None,
        timezone_label=_utc_offset_label(series.venue.timezone),
        date_range_label=_format_date_range(series.starts_on, series.ends_on),
        events_count=events_count,
        days=days,
        blinds_by_event=blinds_by_event if include_blinds else None,
    )


def _enforce_pdf_rate_limit(client_ip: str) -> None:
    settings = get_settings()
    now = time.monotonic()
    window = 60.0
    hits = [ts for ts in _pdf_hits.get(client_ip, []) if now - ts < window]
    if len(hits) >= settings.pdf_rate_limit_per_minute:
        raise RateLimitError("PDF rate limit exceeded", retry_after=60)
    hits.append(now)
    _pdf_hits[client_ip] = hits


@lru_cache(maxsize=1)
def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )


def _qr_data_uri(url: str) -> str:
    qr = qrcode.QRCode(version=None, box_size=4, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1F1A0A", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _organizer_abbrev(name: str, slug: str) -> str:
    if slug:
        return slug.upper()[:4]
    parts = [part for part in name.split() if part]
    if len(parts) >= 2:
        return "".join(part[0] for part in parts[:3]).upper()
    return name[:3].upper()


def _cache_path(series_id: UUID, version: str) -> Path:
    settings = get_settings()
    root = Path(settings.pdf_cache_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{series_id}_{version}.pdf"


def _time_hhmm(venue_local: datetime) -> str:
    return venue_local.strftime("%H:%M")


def _render_pdf_html(series: Series, days: list[SeriesScheduleDay]) -> str:
    settings = get_settings()
    series_url = f"{settings.frontend_base_url.rstrip('/')}/series/{series.slug}"
    currency = None
    for event in series.events:
        if event.currency is not None:
            currency = event.currency
            break
    symbol = currency.symbol if currency else "₽"
    total = Decimal("0")
    has_g = False
    for event in series.events:
        if event.guarantee is not None:
            total += event.guarantee
            has_g = True

    key_structures: list[dict[str, str]] = []
    flat_count = sum(len(day.rows) for day in days)
    if flat_count <= KEY_STRUCTURES_MAX_EVENTS:
        for event in series.events:
            highlight = classify_highlight(
                name=event.name,
                buyin=event.buyin,
                guarantee=event.guarantee,
                tags=list(event.tags),
            )
            if highlight not in {"main", "champ"}:
                continue
            duration = format_level_duration(list(event.blind_levels))
            if not duration:
                continue
            late = resolve_late_reg_level(event)
            parts = [duration]
            if late is not None:
                parts.append(f"LR {late}")
            if event.day_end_note:
                parts.append(event.day_end_note)
            key_structures.append({"name": event.name, "summary": " · ".join(parts)})

    font_path = (FONTS_DIR / "Manrope-Variable.ttf").resolve().as_uri()
    host = (
        settings.frontend_base_url.rstrip("/")
        .replace("https://", "")
        .replace("http://", "")
        or "day2.ru"
    )
    return _jinja_env().get_template("series_schedule.html").render(
        font_path=font_path,
        organizer_abbrev=_organizer_abbrev(series.organizer.name, series.organizer.slug),
        series_name=series.name,
        date_range=_format_date_range(series.starts_on, series.ends_on),
        venue_name=series.venue.name,
        city=series.venue.city,
        country=series.venue.country.name_ru if series.venue.country else "",
        timezone_label=_utc_offset_label(series.venue.timezone),
        currency_symbol=symbol,
        total_guarantee_display=(f"{symbol}{format_money_plain(total)}" if has_g else None),
        qr_data_uri=_qr_data_uri(series_url),
        days=days,
        key_structures=key_structures,
        generated_on=datetime.now(ZoneInfo(series.venue.timezone)).strftime("%d.%m.%Y"),
        public_host=host,
        tournaments_word=tournaments_word,
        time_hhmm=_time_hhmm,
        format_stack=lambda value: format_money_plain(Decimal(value)) if value else "",
    )


def _generate_pdf_bytes(html: str) -> bytes:
    from weasyprint import HTML

    document = HTML(string=html, base_url=str(PACKAGE_ROOT))
    return document.write_pdf()


async def get_series_schedule_pdf(
    session: AsyncSession,
    series_id: UUID,
    *,
    client_ip: str,
) -> tuple[bytes, str, bool]:
    """Return (pdf_bytes, filename, cache_hit)."""
    _enforce_pdf_rate_limit(client_ip)
    settings = get_settings()
    version = await content_version(session, series_id)
    cache_file = _cache_path(series_id, version)
    series = await _load_series(session, series_id)
    name = pdf_filename(
        organizer_slug=series.organizer.slug,
        series_name=series.name,
        starts_on=series.starts_on,
        ends_on=series.ends_on,
    )

    if cache_file.is_file():
        logger.info("schedule_pdf cache_hit series_id=%s version=%s", series_id, version)
        return cache_file.read_bytes(), name, True

    days, _, _, _ = _build_rows(series, include_blinds=False)
    started = time.perf_counter()
    html = _render_pdf_html(series, days)

    try:
        pdf_bytes = await asyncio.wait_for(
            asyncio.to_thread(_generate_pdf_bytes, html),
            timeout=settings.pdf_generation_timeout_seconds,
        )
    except TimeoutError as exc:
        logger.error("schedule_pdf timeout series_id=%s", series_id)
        raise AppError(
            "pdf_timeout",
            "PDF generation timed out",
            status_code=504,
        ) from exc

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    cache_file.write_bytes(pdf_bytes)
    for old in cache_file.parent.glob(f"{series_id}_*.pdf"):
        if old != cache_file:
            with contextlib.suppress(OSError):
                old.unlink()

    logger.info(
        "schedule_pdf generated series_id=%s version=%s duration_ms=%s size=%s",
        series_id,
        version,
        elapsed_ms,
        len(pdf_bytes),
    )
    return pdf_bytes, name, False
