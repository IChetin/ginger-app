from app.core.card_deck import (
    DEFAULT_CARD_DECK,
    SUIT_BLACK,
    SUIT_CLUB,
    SUIT_DIAMOND,
    SUIT_RED,
    parse_card_deck,
    suit_color,
)
from app.models.enums import CardDeck


def test_default_card_deck_is_four_color() -> None:
    assert DEFAULT_CARD_DECK is CardDeck.FOUR_COLOR
    assert parse_card_deck(None) is CardDeck.FOUR_COLOR
    assert parse_card_deck("nope") is CardDeck.FOUR_COLOR
    assert parse_card_deck("classic") is CardDeck.CLASSIC


def test_four_color_assigns_distinct_suit_colors() -> None:
    assert suit_color("s") == SUIT_BLACK
    assert suit_color("h") == SUIT_RED
    assert suit_color("d") == SUIT_DIAMOND
    assert suit_color("c") == SUIT_CLUB


def test_classic_paints_clubs_and_spades_black() -> None:
    assert suit_color("s", CardDeck.CLASSIC) == SUIT_BLACK
    assert suit_color("c", CardDeck.CLASSIC) == SUIT_BLACK
    assert suit_color("h", CardDeck.CLASSIC) == SUIT_RED
    assert suit_color("d", CardDeck.CLASSIC) == SUIT_RED
