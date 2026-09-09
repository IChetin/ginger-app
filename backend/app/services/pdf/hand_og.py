"""Public hand OG preview: Jinja2 HTML → WeasyPrint PDF → PNG 1200×630."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML  # type: ignore[import-untyped]

from app.core.card_deck import DEFAULT_CARD_DECK, SUIT_COLORS, suit_color
from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.auth import User
from app.models.hands import Hand
from app.schemas.hands import HandDocument, parse_stored_hand
from app.services import hands as hands_service

logger = logging.getLogger(__name__)

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = PACKAGE_ROOT / "templates" / "pdf"
FONTS_DIR = PACKAGE_ROOT / "static" / "fonts"

PDF_TO_PNG_DPI = 96
# Bump when the PNG layout changes so Telegram and disk cache both miss.
OG_IMAGE_VERSION = "4"

_SUIT = {"s": "♠", "h": "♥", "d": "♦", "c": "♣"}
_RANK = {"T": "10"}
MINUS = "\u2212"


def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )


def _format_chips_unsigned(value: int) -> str:
    return f"{abs(value):,}".replace(",", " ")


def _format_chips(value: int) -> str:
    body = _format_chips_unsigned(value)
    if value > 0:
        return f"+{body} ₽"
    if value < 0:
        return f"{MINUS}{body} ₽"
    return f"{body} ₽"


_RANK_ORDER = "23456789TJQKA"


def _hole_short(cards: list[str]) -> str:
    if len(cards) != 2:
        return ""
    first, second = cards[0], cards[1]
    ranks = sorted(
        (first[0], second[0]),
        key=lambda rank: _RANK_ORDER.find(rank),
        reverse=True,
    )
    if ranks[0] == ranks[1]:
        return f"{ranks[0]}{ranks[1]}"
    if first[1] == second[1]:
        return f"{ranks[0]}{ranks[1]}{_SUIT.get(first[1], first[1])}"
    return f"{ranks[0]}{ranks[1]}o"


def _board_pretty(board: list[str]) -> str:
    return "".join(f"{card[0]}{_SUIT.get(card[1], card[1])}" for card in board if len(card) >= 2)


def _longest_board(data: HandDocument) -> list[str]:
    board: list[str] = []
    for street in data.streets:
        if street.board:
            board = list(street.board)
    return board


def public_og_meta(
    *,
    data: HandDocument,
    nickname: str,
    event_label: str | None,
    note: str | None,
) -> tuple[str, str]:
    """Title/description for crawlers. Nickname only — never a separate FIO field."""
    hero = next((seat for seat in data.seats if seat.is_hero), None)
    hole = _hole_short(list(hero.cards) if hero is not None else [])
    board = _board_pretty(_longest_board(data))
    pot = _format_chips_unsigned(data.result.pot)
    if hole and board:
        title = f"{hole} на {board} · банк {pot}"
    elif hole:
        title = f"{hole} · банк {pot}"
    elif event_label:
        title = f"Раздача от {nickname} · {event_label}"
    else:
        title = f"Раздача от {nickname}"
    parts = [f"Раздача от {nickname}"]
    if event_label:
        parts.append(event_label)
    if hole:
        parts.append(hole)
    parts.append(f"банк {pot}")
    description = note or " · ".join(parts)
    return title, description


def og_image_url(*, origin: str, slug: str, updated_at: datetime) -> str:
    stamp = updated_at.strftime("%Y%m%d%H%M%S")
    return f"{origin.rstrip('/')}/api/v1/hands/{slug}/og.png?v={OG_IMAGE_VERSION}.{stamp}"


def _pdf_to_png(pdf_bytes: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix="day2-hand-og-") as tmp:
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
                "og_unavailable",
                "PNG converter (pdftoppm) is not installed",
                status_code=503,
            ) from exc
        except subprocess.CalledProcessError as exc:
            logger.error("pdftoppm failed: %s", exc.stderr.decode(errors="replace"))
            raise AppError(
                "og_failed",
                "Failed to rasterize hand OG image",
                status_code=500,
            ) from exc
        png_path = out_base.with_suffix(".png")
        if not png_path.is_file():
            raise AppError("og_failed", "OG PNG was not produced", status_code=500)
        return png_path.read_bytes()


def _cache_path(slug: str, stamp: str) -> Path:
    settings = get_settings()
    root = Path(settings.pdf_cache_dir) / "hand-og"
    root.mkdir(parents=True, exist_ok=True)
    safe = "".join(ch for ch in stamp if ch.isalnum() or ch in {"-", "_"})
    return root / f"{slug}_{safe}_v{OG_IMAGE_VERSION}.png"


def cards_for_og(cards: list[str]) -> list[dict[str, str]]:
    payload: list[dict[str, str]] = []
    for card in cards:
        if len(card) < 2:
            continue
        payload.append(
            {
                "rank": _RANK.get(card[0], card[0]),
                "suit": _SUIT.get(card[1], card[1]),
                "suit_key": card[1],
                "color": suit_color(card[1], DEFAULT_CARD_DECK),
            }
        )
    return payload


def render_hand_og_html(
    *,
    hero_cards: list[str],
    board: list[str],
    author_label: str,
    pot_label: str,
    font_path: str | None = None,
) -> str:
    path = font_path or (FONTS_DIR / "Manrope-Variable.ttf").resolve().as_uri()
    return (
        _jinja_env()
        .get_template("hand_og.html")
        .render(
            font_path=path,
            hero_cards=cards_for_og(hero_cards),
            board=cards_for_og(board),
            author_label=author_label,
            pot_label=pot_label,
            suit_colors=SUIT_COLORS[DEFAULT_CARD_DECK],
        )
    )


def _event_label(row: Hand) -> str | None:
    if row.event is not None:
        if row.event.series is not None:
            return f"{row.event.name} · {row.event.series.name}"
        return row.event.name
    return row.title


def _render_html(row: Hand, data: HandDocument) -> str:
    hero = next(seat for seat in data.seats if seat.is_hero)
    event_label = _event_label(row)
    author_label = f"{row.user.nickname} · {event_label}" if event_label else row.user.nickname
    return render_hand_og_html(
        hero_cards=list(hero.cards),
        board=_longest_board(data),
        author_label=author_label,
        pot_label=_format_chips_unsigned(data.result.pot),
    )


async def get_hand_og_png(
    session: AsyncSession,
    slug: str,
    viewer: User | None,
) -> tuple[bytes, bool]:
    row = await hands_service.get_hand(session, slug, viewer, increment_views=False)
    if not row.is_public or row.slug is None:
        raise NotFoundError("Раздача не найдена")
    data = parse_stored_hand(row.data)
    stamp = row.updated_at.strftime("%Y%m%d%H%M%S")
    cache_file = _cache_path(slug, stamp)
    if cache_file.is_file():
        return cache_file.read_bytes(), True

    html = _render_html(row, data)
    settings = get_settings()
    started = time.perf_counter()
    try:
        png_bytes = await asyncio.wait_for(
            asyncio.to_thread(
                lambda: _pdf_to_png(HTML(string=html, base_url=str(PACKAGE_ROOT)).write_pdf())
            ),
            timeout=settings.pdf_generation_timeout_seconds,
        )
    except TimeoutError as exc:
        raise AppError("og_timeout", "OG generation timed out", status_code=504) from exc

    cache_file.write_bytes(png_bytes)
    for old in cache_file.parent.glob(f"{slug}_*.png"):
        if old != cache_file:
            with contextlib.suppress(OSError):
                old.unlink()
    logger.info(
        "hand_og generated slug=%s duration_ms=%s size=%s",
        slug,
        int((time.perf_counter() - started) * 1000),
        len(png_bytes),
    )
    return png_bytes, False
