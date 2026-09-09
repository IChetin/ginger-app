import uuid
from typing import Final, TypedDict


class CountrySeed(TypedDict):
    code: str
    name_ru: str


class CurrencySeed(TypedDict):
    code: str
    symbol: str


class OrganizerSeed(TypedDict):
    id: uuid.UUID
    name: str
    slug: str
    links: dict[str, str]


class VenueSeed(TypedDict):
    id: uuid.UUID
    country_code: str
    city: str
    name: str
    slug: str
    zone: str | None
    timezone: str


COUNTRIES: Final[list[CountrySeed]] = [
    {"code": "RU", "name_ru": "Россия"},
    {"code": "BY", "name_ru": "Беларусь"},
    {"code": "CY", "name_ru": "Кипр"},
]

CURRENCIES: Final[list[CurrencySeed]] = [
    {"code": "RUB", "symbol": "₽"},
    {"code": "BYN", "symbol": "Br"},
    {"code": "USD", "symbol": "$"},
    {"code": "EUR", "symbol": "€"},
]

ORGANIZERS: Final[list[OrganizerSeed]] = [
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000001"),
        "name": "RPT",
        "slug": "rpt",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000002"),
        "name": "EAPT",
        "slug": "eapt",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000003"),
        "name": "APC",
        "slug": "apc",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000004"),
        "name": "RPF",
        "slug": "rpf",
        "links": {},
    },
    {
        "id": uuid.UUID("10000000-0000-4000-8000-000000000005"),
        "name": "Belarus Poker Tour",
        "slug": "bpt",
        "links": {},
    },
]

VENUES: Final[list[VenueSeed]] = [
    {
        "id": uuid.UUID("20000000-0000-4000-8000-000000000001"),
        "country_code": "RU",
        "city": "Сочи",
        "name": "Красная Поляна",
        "slug": "krasnaya-polyana",
        "zone": "Красная Поляна",
        "timezone": "Europe/Moscow",
    },
    {
        "id": uuid.UUID("20000000-0000-4000-8000-000000000002"),
        "country_code": "BY",
        "city": "Минск",
        "name": "Минск",
        "slug": "minsk",
        "zone": None,
        "timezone": "Europe/Minsk",
    },
    {
        "id": uuid.UUID("20000000-0000-4000-8000-000000000003"),
        "country_code": "RU",
        "city": "Калининград",
        "name": "Калининград",
        "slug": "kaliningrad",
        "zone": "Янтарная",
        "timezone": "Europe/Kaliningrad",
    },
    {
        "id": uuid.UUID("20000000-0000-4000-8000-000000000004"),
        "country_code": "CY",
        "city": "Никосия",
        "name": "Никосия",
        "slug": "nicosia",
        "zone": None,
        "timezone": "Asia/Nicosia",
    },
]
