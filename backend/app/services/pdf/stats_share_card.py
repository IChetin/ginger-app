"""Tracker stats share-card: Jinja2 HTML → WeasyPrint PDF → PNG via pdftoppm."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import io
import logging
import subprocess
import tempfile
import time
from datetime import UTC, date
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from uuid import UUID

import qrcode
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError, RateLimitError
from app.models.auth import User
from app.models.references import Currency
from app.models.tracker import Result
from app.schemas.stats import StatsFilterParams
from app.services import stats as stats_service
from app.services.pdf.highlight import format_money_plain
from app.utils.plural import plural_ru, tournaments_word

logger = logging.getLogger(__name__)

PACKAGE_ROOT = Path(__file__).resolve().parents[2]  # backend/app
TEMPLATES_DIR = PACKAGE_ROOT / "templates" / "pdf"
FONTS_DIR = PACKAGE_ROOT / "static" / "fonts"

CARD_SIZE_PX = 1080
PDF_TO_PNG_DPI = 96  # 1080 CSS px @ 96dpi → 1080 PNG px

_MONTHS_NOM = (
    "",
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
)

_share_hits: dict[str, list[float]] = {}

NBSP = "\u00a0"
MINUS = "\u2212"


def format_money_signed(value: Decimal, symbol: str) -> str:
    """`+214 000 ₽` / `−48 300 ₽` / `0 ₽` (no sign at zero)."""
    quantized = value.quantize(Decimal("0.01"))
    if quantized == 0:
        return f"0{NBSP}{symbol}"
    body = format_money_plain(abs(quantized))
    if quantized > 0:
        return f"+{body}{NBSP}{symbol}"
    return f"{MINUS}{body}{NBSP}{symbol}"


def format_money_plain_nb(value: Decimal, symbol: str) -> str:
    """Unsigned money with currency: `111 000 ₽`."""
    return f"{format_money_plain(value)}{NBSP}{symbol}"


def format_percent_signed(value: Decimal | None, *, show_sign: bool = True) -> str:
    """`+192,8 %` / `−52,5 %` / `0,0 %` / `—`."""
    if value is None:
        return "—"
    quantized = value.quantize(Decimal("0.1"))
    raw = format(abs(quantized), "f")
    if "." in raw:
        whole, frac = raw.split(".", 1)
        frac = (frac + "0")[:1]
        body = f"{whole},{frac}"
    else:
        body = f"{raw},0"
    int_part, _, frac_part = body.partition(",")
    grouped: list[str] = []
    while int_part:
        grouped.append(int_part[-3:])
        int_part = int_part[:-3]
    int_fmt = NBSP.join(reversed(grouped)) if grouped else "0"
    body = f"{int_fmt},{frac_part}" if frac_part else int_fmt
    if quantized == 0 or not show_sign:
        prefix = ""
    elif quantized > 0:
        prefix = "+"
    else:
        prefix = MINUS
    return f"{prefix}{body}{NBSP}%"


def format_percent_plain(value: Decimal) -> str:
    """`33,3 %` without sign."""
    return format_percent_signed(value, show_sign=False)


def format_period_label(date_from: date | None, date_to: date | None) -> str:
    """Russian period words: «Январь — июль 2026», «Июль 2026», «Всё время»."""
    if date_from is None and date_to is None:
        return "Всё время"
    if date_from is not None and date_to is None:
        return f"с {_month_cap(date_from.month)} {date_from.year}"
    if date_from is None and date_to is not None:
        return f"до {_month_cap(date_to.month)} {date_to.year}"
    assert date_from is not None and date_to is not None
    if date_from.year == date_to.year and date_from.month == date_to.month:
        return f"{_month_cap(date_from.month)} {date_from.year}"
    if date_from.year == date_to.year:
        return (
            f"{_month_cap(date_from.month)} — {_MONTHS_NOM[date_to.month]} {date_from.year}"
        )
    return (
        f"{_month_cap(date_from.month)} {date_from.year} — "
        f"{_MONTHS_NOM[date_to.month]} {date_to.year}"
    )


def share_card_filename(date_from: date | None, date_to: date | None) -> str:
    """`Day2_stats_2026-07.png` / `Day2_stats_2026.png` / `Day2_stats_all.png`."""
    if date_from is None and date_to is None:
        return "Day2_stats_all.png"
    if date_from is not None and date_to is not None:
        if date_from.year == date_to.year and date_from.month == date_to.month:
            return f"Day2_stats_{date_from.year:04d}-{date_from.month:02d}.png"
        if date_from.month == 1 and date_from.day == 1 and date_from.year == date_to.year:
            return f"Day2_stats_{date_from.year:04d}.png"
    if date_from is not None and date_to is not None and date_from.year == date_to.year:
        return f"Day2_stats_{date_from.year:04d}.png"
    if date_to is not None:
        return f"Day2_stats_{date_to.year:04d}-{date_to.month:02d}.png"
    assert date_from is not None
    return f"Day2_stats_{date_from.year:04d}-{date_from.month:02d}.png"


def hero_font_size(text: str) -> int:
    """Shrink main profit so huge amounts fit."""
    length = len(text.replace(NBSP, " "))
    if length <= 12:
        return 60
    if length <= 14:
        return 52
    if length <= 16:
        return 46
    if length <= 18:
        return 40
    return 34


def entries_word(count: int) -> str:
    return plural_ru(count, "вход", "входа", "входов")


def build_chart_paths(
    values: list[float],
    *,
    width: float = 552,
    height: float = 180,
    pad: float = 14,
) -> dict[str, float | str]:
    """SVG path data + zero line Y for cumulative profit chart."""
    if not values:
        zero_y = height * 0.75
        return {
            "line_d": "",
            "fill_d": "",
            "zero_y": zero_y,
            "end_x": width,
            "end_y": zero_y,
            "zero_label_pct": 25.0,
        }

    min_y = min(*values, 0.0)
    max_y = max(*values, 0.0)
    span = max_y - min_y or 1.0
    usable = height - 2 * pad

    def x_at(index: int) -> float:
        if len(values) == 1:
            return width
        return index / (len(values) - 1) * width

    def y_at(value: float) -> float:
        return pad + (1.0 - (value - min_y) / span) * usable

    zero_y = y_at(0.0)
    coords = [(x_at(i), y_at(v)) for i, v in enumerate(values)]
    if len(coords) == 1:
        y = coords[0][1]
        line_d = f"M0 {y:.2f} L{width:.2f} {y:.2f}"
        end_x, end_y = width, y
    else:
        line_d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in coords)
        end_x, end_y = coords[-1]

    last_value = values[-1]
    if last_value < 0:
        # Fill between curve and zero line.
        fill_d = (
            line_d
            + f" L{end_x:.2f} {zero_y:.2f} L{coords[0][0]:.2f} {zero_y:.2f} Z"
        )
    else:
        # Fill under curve to chart bottom.
        fill_d = line_d + f" L{end_x:.2f} {height:.2f} L{coords[0][0]:.2f} {height:.2f} Z"

    zero_label_pct = max(2.0, min(92.0, (zero_y / height) * 100.0))
    return {
        "line_d": line_d,
        "fill_d": fill_d,
        "zero_y": zero_y,
        "end_x": end_x,
        "end_y": end_y,
        "zero_label_pct": zero_label_pct,
    }


def _month_cap(month: int) -> str:
    name = _MONTHS_NOM[month]
    return name[:1].upper() + name[1:]


def _enforce_share_rate_limit(client_ip: str) -> None:
    settings = get_settings()
    now = time.monotonic()
    window = 60.0
    hits = [ts for ts in _share_hits.get(client_ip, []) if now - ts < window]
    if len(hits) >= settings.pdf_rate_limit_per_minute:
        raise RateLimitError("Share-card rate limit exceeded", retry_after=60)
    hits.append(now)
    _share_hits[client_ip] = hits


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
    img = qr.make_image(fill_color="#0B0A09", back_color="#F5F2EA")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _filters_fingerprint(filters: StatsFilterParams) -> str:
    payload = filters.model_dump(mode="json")
    raw = repr(sorted(payload.items())).encode()
    return hashlib.sha1(raw).hexdigest()[:16]


async def _content_version(
    session: AsyncSession,
    user: User,
    filters: StatsFilterParams,
) -> str:
    latest = await session.scalar(
        select(func.max(Result.updated_at)).where(Result.user_id == user.id)
    )
    stamp = latest.astimezone(UTC).isoformat() if latest is not None else "empty"
    material = f"{user.id}:{user.base_currency}:{stamp}:{_filters_fingerprint(filters)}"
    return hashlib.sha1(material.encode()).hexdigest()[:16]


def _cache_path(user_id: UUID, version: str) -> Path:
    settings = get_settings()
    root = Path(settings.pdf_cache_dir) / "share-cards"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{user_id}_{version}.png"


def _best_finish(
    selected: list[tuple[Result, Decimal, Decimal]],
) -> tuple[int | None, bool]:
    """Return (best place, is_itm). Lower place is better."""
    best: tuple[int, bool] | None = None
    for result, _, won in selected:
        if result.place is None:
            continue
        is_itm = won > 0
        if best is None or result.place < best[0]:
            best = (result.place, is_itm)
    if best is None:
        return None, False
    return best[0], best[1]


def _currency_symbol(session_sync_symbol: str | None, code: str) -> str:
    if session_sync_symbol:
        return session_sync_symbol
    defaults = {"RUB": "₽", "USD": "$", "EUR": "€", "BYN": "Br"}
    return defaults.get(code, code)


async def _load_currency_symbol(session: AsyncSession, code: str) -> str:
    symbol = await session.scalar(select(Currency.symbol).where(Currency.code == code))
    return _currency_symbol(symbol, code)


def _render_html(
    *,
    period_label: str,
    profit_text: str,
    profit_tone: str,
    hero_size: int,
    tournaments_label: str,
    invested_label: str,
    best_finish_html: Markup,
    roi_text: str,
    roi_tone: str,
    abi_text: str,
    entries_label: str,
    itm_text: str,
    itm_detail: str,
    chart: dict[str, float | str],
    chart_tone: str,
    qr_data_uri: str,
    public_host: str,
    font_path: str,
) -> str:
    return _jinja_env().get_template("stats_share_card.html").render(
        font_path=font_path,
        period_label=period_label,
        profit_text=profit_text,
        profit_tone=profit_tone,
        hero_size=hero_size,
        tournaments_label=tournaments_label,
        invested_label=invested_label,
        best_finish_html=best_finish_html,
        roi_text=roi_text,
        roi_tone=roi_tone,
        abi_text=abi_text,
        entries_label=entries_label,
        itm_text=itm_text,
        itm_detail=itm_detail,
        chart=chart,
        chart_tone=chart_tone,
        qr_data_uri=qr_data_uri,
        public_host=public_host,
    )


def _pdf_to_png(pdf_bytes: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix="day2-share-") as tmp:
        tmp_path = Path(tmp)
        pdf_path = tmp_path / "card.pdf"
        out_base = tmp_path / "card"
        pdf_path.write_bytes(pdf_bytes)
        try:
            subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-singlefile",
                    "-r",
                    str(PDF_TO_PNG_DPI),
                    str(pdf_path),
                    str(out_base),
                ],
                check=True,
                capture_output=True,
            )
        except FileNotFoundError as exc:
            raise AppError(
                "share_card_unavailable",
                "PNG converter (pdftoppm) is not installed",
                status_code=503,
            ) from exc
        except subprocess.CalledProcessError as exc:
            logger.error("pdftoppm failed: %s", exc.stderr.decode(errors="replace"))
            raise AppError(
                "share_card_failed",
                "Failed to rasterize share card",
                status_code=500,
            ) from exc
        png_path = out_base.with_suffix(".png")
        if not png_path.is_file():
            raise AppError(
                "share_card_failed",
                "Share card PNG was not produced",
                status_code=500,
            )
        return png_path.read_bytes()


def _generate_png_bytes(html: str) -> bytes:
    pdf_bytes = HTML(string=html, base_url=str(PACKAGE_ROOT)).write_pdf()
    return _pdf_to_png(pdf_bytes)


async def get_stats_share_card_png(
    session: AsyncSession,
    user: User,
    filters: StatsFilterParams,
    *,
    client_ip: str,
) -> tuple[bytes, str, bool]:
    """Return (png_bytes, filename, cache_hit)."""
    _enforce_share_rate_limit(client_ip)

    selected = await stats_service.select_converted_results(session, user, filters)
    if not selected:
        raise NotFoundError("No results for share card")

    version = await _content_version(session, user, filters)
    cache_file = _cache_path(user.id, version)
    filename = share_card_filename(filters.date_from, filters.date_to)

    if cache_file.is_file():
        logger.info("share_card cache_hit user_id=%s version=%s", user.id, version)
        return cache_file.read_bytes(), filename, True

    summary = await stats_service.compute_stats(session, user, filters)
    chart = await stats_service.compute_chart(session, user, filters)
    symbol = await _load_currency_symbol(session, user.base_currency)

    profit = summary.profit
    if profit > 0:
        profit_tone = "pos"
        chart_tone = "pos"
    elif profit < 0:
        profit_tone = "neg"
        chart_tone = "neg"
    else:
        profit_tone = "zero"
        chart_tone = "pos"

    profit_text = format_money_signed(profit, symbol)
    roi_text = format_percent_signed(summary.roi)
    if summary.roi is None:
        roi_tone = "neutral"
    elif summary.roi > 0:
        roi_tone = "pos"
    elif summary.roi < 0:
        roi_tone = "neg"
    else:
        roi_tone = "neutral"

    abi_text = format_money_plain_nb(summary.abi, symbol) if summary.abi is not None else "—"
    itm_count = sum(1 for _, _, won in selected if won > 0)
    place, place_itm = _best_finish(selected)
    if place is None:
        best_finish_html = Markup("лучший финиш —")
    elif place_itm:
        best_finish_html = Markup(
            f'лучший финиш <b class="itm">{place} место</b>'
        )
    else:
        best_finish_html = Markup(
            f'лучший финиш <b class="out">{place} место</b>'
        )

    settings = get_settings()
    app_url = settings.frontend_base_url.rstrip("/") or "https://day2.ru"
    public_host = (
        app_url.replace("https://", "").replace("http://", "") or "day2.ru"
    )
    font_path = (FONTS_DIR / "Manrope-Variable.ttf").resolve().as_uri()

    cumulative = [float(point.cumulative_profit) for point in chart.points]
    chart_paths = build_chart_paths(cumulative)

    html = _render_html(
        period_label=format_period_label(filters.date_from, filters.date_to),
        profit_text=profit_text,
        profit_tone=profit_tone,
        hero_size=hero_font_size(profit_text),
        tournaments_label=f"{summary.tournaments} {tournaments_word(summary.tournaments)}",
        invested_label=f"вложено {format_money_plain_nb(summary.invested, symbol)}",
        best_finish_html=best_finish_html,
        roi_text=roi_text,
        roi_tone=roi_tone,
        abi_text=abi_text,
        entries_label=f"{summary.entries} {entries_word(summary.entries)}",
        itm_text=format_percent_plain(summary.itm),
        itm_detail=f"{itm_count} из {summary.tournaments}",
        chart=chart_paths,
        chart_tone=chart_tone,
        qr_data_uri=_qr_data_uri(app_url),
        public_host=public_host,
        font_path=font_path,
    )

    started = time.perf_counter()
    try:
        png_bytes = await asyncio.wait_for(
            asyncio.to_thread(_generate_png_bytes, html),
            timeout=settings.pdf_generation_timeout_seconds,
        )
    except TimeoutError as exc:
        logger.error("share_card timeout user_id=%s", user.id)
        raise AppError(
            "share_card_timeout",
            "Share card generation timed out",
            status_code=504,
        ) from exc

    cache_file.write_bytes(png_bytes)
    for old in cache_file.parent.glob(f"{user.id}_*.png"):
        if old != cache_file:
            with contextlib.suppress(OSError):
                old.unlink()

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "share_card generated user_id=%s version=%s duration_ms=%s size=%s",
        user.id,
        version,
        elapsed_ms,
        len(png_bytes),
    )
    return png_bytes, filename, False
