import uuid
from decimal import Decimal
from typing import Final, TypedDict


class CurrencySeed(TypedDict):
    code: str
    symbol: str


class OrganizerSeed(TypedDict):
    id: uuid.UUID
    name: str
    slug: str
    links: dict[str, str]


class ClubSeed(TypedDict):
    id: uuid.UUID
    name: str
    slug: str
    app: str
    app_club_id: str | None
    organizer_id: uuid.UUID | None
    chip_value: Decimal | None
    chip_currency_code: str | None
    games: str | None
    limits: str | None
    peak_hours: str | None
    active_players: str | None
    rakeback_note: str | None
    is_visible: bool
    sort_order: int
    schedule_source_url: str | None


CURRENCIES: Final[list[CurrencySeed]] = [
    {"code": "RUB", "symbol": "₽"},
    {"code": "BYN", "symbol": "Br"},
    {"code": "USD", "symbol": "$"},
    {"code": "EUR", "symbol": "€"},
    # Ginger APP: курс фишки в долларовых клубах. ЦБ USDT не публикует — курс к рублю
    # задаётся вручную (ТЗ §8а.3). Игроку USDT показываем как «$» — для него это тот же доллар.
    {"code": "USDT", "symbol": "$"},
]

ORGANIZERS: Final[list[OrganizerSeed]] = [
    # Ginger APP: союзы, в которых живут клубы.
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000101"),
        "name": "NUTS",
        "slug": "nuts",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000102"),
        "name": "Black Sea",
        "slug": "black-sea",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000103"),
        "name": "Poker21",
        "slug": "poker21",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000104"),
        "name": "Просторы Покера",
        "slug": "prosto",
        "links": {},
    },
]


def _club(
    number: int,
    name: str,
    slug: str,
    app: str,
    *,
    app_club_id: str | None = None,
    organizer_slug: str | None = None,
    chip_value: str | None = None,
    chip_currency_code: str | None = None,
    games: str | None = None,
    limits: str | None = None,
    peak_hours: str | None = None,
    active_players: str | None = None,
    rakeback_note: str | None = None,
    is_visible: bool = True,
    schedule_source_url: str | None = None,
) -> ClubSeed:
    organizer_ids = {item["slug"]: item["id"] for item in ORGANIZERS}
    return {
        "id": uuid.UUID(f"40000000-0000-4000-8000-{number:012d}"),
        "name": name,
        "slug": slug,
        "app": app,
        "app_club_id": app_club_id,
        "organizer_id": organizer_ids[organizer_slug] if organizer_slug else None,
        "chip_value": Decimal(chip_value) if chip_value else None,
        "chip_currency_code": chip_currency_code,
        "games": games,
        "limits": limits,
        "peak_hours": peak_hours,
        "active_players": active_players,
        "rakeback_note": rakeback_note,
        "is_visible": is_visible,
        "sort_order": number * 10,
        "schedule_source_url": schedule_source_url,
    }


# Опубликованные листы союзов: сетка забирается раз в день (ответ 11.31).
NUTS_SHEET_CSV: Final = (
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7-OC6PxF1wSXigQM9SMGZDgafNeY4uZzV2DUob"
    "c8789xWwg5s-NDhLJXuXPIiKxIUrF8Q5vu3knQS/pub?gid=683108560&single=true&output=csv"
)
PRIVATE_G_SHEET_CSV: Final = (
    "https://docs.google.com/spreadsheets/d/1YTeS47T9eISDV5CxgSNGGLxyUtEBNViTs4iC06u3qRE"
    "/export?format=csv"
)


# Стартовый справочник клубов Ginger APP (ТЗ §10.2, форма ginger-app-clubs-form.html).
# Сидится только отсутствующее — правки из админки не перетираются.
# Пустые ID и курсы — «уточнить», их заполняет Иван.
CLUBS: Final[list[ClubSeed]] = [
    _club(
        1,
        "Ginger",
        "ginger",
        "pppoker",
        app_club_id="1049607",
        organizer_slug="nuts",
        chip_value="1",
        chip_currency_code="USDT",
        games="NLH / PLO / MTT",
        limits="Low to High",
        peak_hours="17:00–07:00",
        active_players="200+",
        schedule_source_url=NUTS_SHEET_CSV,
    ),
    _club(
        2,
        "Ginger21",
        "ginger21",
        "poker21",
        app_club_id="542765",
        organizer_slug="poker21",
        chip_value="1",
        chip_currency_code="RUB",
    ),
    _club(
        3,
        "Ginger+",
        "ginger-plus",
        "xpoker",
        organizer_slug="black-sea",
        chip_value="100",
        chip_currency_code="RUB",
    ),
    _club(4, "G.Psy", "g-psy", "pppoker", chip_value="100", chip_currency_code="RUB"),
    # 5 — «Синий Апельсин», убран 2026-09-13: клуб неактивен.
    _club(
        6,
        "GoDaddy!",
        "godaddy",
        "pppoker",
        app_club_id="3208572",
        rakeback_note="Рейкбек со всего фи, MTT не вычитаем",
        is_visible=False,
    ),
    _club(
        7,
        "Private.G",
        "private-g",
        "pppoker",
        organizer_slug="prosto",
        app_club_id="4207878",
        chip_value="100",
        chip_currency_code="RUB",
        schedule_source_url=PRIVATE_G_SHEET_CSV,
    ),
]
