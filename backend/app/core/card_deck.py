"""Suit colors for playing cards. OG preview always uses four-color."""

from app.models.enums import CardDeck

DEFAULT_CARD_DECK = CardDeck.FOUR_COLOR

SUIT_BLACK = "#1A1710"
SUIT_RED = "#C7382F"
SUIT_DIAMOND = "#2E6FC4"
SUIT_CLUB = "#1F8A4C"

SUIT_COLORS: dict[CardDeck, dict[str, str]] = {
    CardDeck.CLASSIC: {
        "s": SUIT_BLACK,
        "h": SUIT_RED,
        "d": SUIT_RED,
        "c": SUIT_BLACK,
    },
    CardDeck.FOUR_COLOR: {
        "s": SUIT_BLACK,
        "h": SUIT_RED,
        "d": SUIT_DIAMOND,
        "c": SUIT_CLUB,
    },
}


def suit_color(suit: str, scheme: CardDeck = DEFAULT_CARD_DECK) -> str:
    palette = SUIT_COLORS[scheme]
    return palette.get(suit, SUIT_BLACK)


def parse_card_deck(value: str | CardDeck | None) -> CardDeck:
    if isinstance(value, CardDeck):
        return value
    try:
        return CardDeck(value)
    except (TypeError, ValueError):
        return DEFAULT_CARD_DECK
