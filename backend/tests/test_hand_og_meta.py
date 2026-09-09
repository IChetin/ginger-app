from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from app.core.card_deck import SUIT_BLACK, SUIT_CLUB, SUIT_DIAMOND, SUIT_RED
from app.schemas.hands import HandData
from app.services.pdf.hand_og import (
    MINUS,
    OG_IMAGE_VERSION,
    _format_chips,
    _hole_short,
    cards_for_og,
    og_image_url,
    public_og_meta,
    render_hand_og_html,
)
from tests.test_hand_engine import FOLD_PREFLOP, SAMPLE_HAND


def test_public_og_meta_uses_nickname_and_hand_not_profit() -> None:
    data = HandData.model_validate(SAMPLE_HAND)
    title, description = public_og_meta(
        data=data,
        nickname="ivan_mtt",
        event_label="Main Event · RPT",
        note=None,
    )
    assert title.startswith("AKo на K")
    assert "банк 114 000" in title
    assert "Раздача от ivan_mtt" in description
    assert "Main Event · RPT" in description
    assert "55 500" not in description
    assert "55500" not in description


def test_public_og_meta_note_overrides_description() -> None:
    data = HandData.model_validate(SAMPLE_HAND)
    _, description = public_og_meta(
        data=data,
        nickname="ivan_mtt",
        event_label=None,
        note="Стоит ли коллировать",
    )
    assert description == "Стоит ли коллировать"


def test_public_og_meta_suited_uses_suit_glyph() -> None:
    payload = deepcopy(SAMPLE_HAND)
    seats = payload["seats"]
    assert isinstance(seats, list)
    hero = seats[0]
    assert isinstance(hero, dict)
    hero["cards"] = ["Ah", "Kh"]
    data = HandData.model_validate(payload)
    title, _ = public_og_meta(
        data=data,
        nickname="ivan_mtt",
        event_label=None,
        note=None,
    )
    assert title.startswith("AK♥ на ")
    assert "AKs" not in title


def test_public_og_meta_preflop_has_no_board() -> None:
    data = HandData.model_validate(FOLD_PREFLOP)
    title, description = public_og_meta(
        data=data,
        nickname="ivan_mtt",
        event_label=None,
        note=None,
    )
    assert title == "AA · банк 4 000"
    assert "на " not in title
    assert "Раздача от ivan_mtt" in description
    assert "1 500" not in description


def test_format_chips_uses_minus_and_currency() -> None:
    assert _format_chips(-39_500) == f"{MINUS}39 500 ₽"
    assert _format_chips(39_500) == "+39 500 ₽"
    assert _hole_short(["Ah", "Kd"]) == "AKo"
    assert _hole_short(["Ah", "Kh"]) == "AK♥"
    assert _hole_short(["As", "Ad"]) == "AA"


def test_og_image_url_includes_layout_version_and_updated_at() -> None:
    url = og_image_url(
        origin="https://day2.pro",
        slug="sPEP3TQZeJ",
        updated_at=datetime(2026, 8, 13, 12, 30, 45, tzinfo=UTC),
    )
    assert url == (
        f"https://day2.pro/api/v1/hands/sPEP3TQZeJ/og.png?v={OG_IMAGE_VERSION}.20260813123045"
    )


def test_og_html_table_layout_separates_hand_and_board() -> None:
    html = render_hand_og_html(
        hero_cards=["As", "Kc"],
        board=["Ks", "9h", "4d", "7d", "2c"],
        author_label="ivan_mtt · Main Event",
        pot_label="104 000",
    )
    assert "display:flex" not in html
    assert "display: flex" not in html
    assert "gap:" not in html
    assert 'cellspacing="8"' in html
    assert "НА БОРДЕ" in html
    assert html.count("card board") == 5
    assert "ivan_mtt · Main Event" in html
    assert "банк 104 000" in html
    assert "55 500" not in html
    assert "Manrope" in html
    assert "font-weight: 800" in html
    assert "width: 72px" in html
    assert "height: 100px" in html
    assert "font-size: 34px" in html
    assert "font-size: 24px" in html
    assert "card s" in html
    assert "card board s" in html
    assert "#2E6FC4" in html
    assert "#1F8A4C" in html
    assert "card red" not in html
    assert "Запись раздачи" in html
    assert "Разбор раздачи" not in html
    assert "white-space: nowrap" in html
    assert "letter-spacing: 0.14em" in html


def test_og_html_preflop_omits_board_label() -> None:
    html = render_hand_og_html(
        hero_cards=["Ah", "Ad"],
        board=[],
        author_label="ivan_mtt",
        pot_label="4 000",
    )
    assert "НА БОРДЕ" not in html
    assert "card board" not in html
    assert "банк 4 000" in html
    assert "ivan_mtt" in html


def test_og_cards_always_use_four_color() -> None:
    cards = cards_for_og(["As", "Ah", "Ad", "Ac"])
    assert [item["color"] for item in cards] == [SUIT_BLACK, SUIT_RED, SUIT_DIAMOND, SUIT_CLUB]
    assert [item["suit_key"] for item in cards] == ["s", "h", "d", "c"]
