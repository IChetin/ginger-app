"""Сопоставление организаторов, площадок и стран из файла со справочниками базы.

Сопоставление — по названию без учёта регистра и лишних пробелов. Чего нет,
то создаётся при публикации, но сначала показывается админу в предпросмотре.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.references import Country, Organizer, Venue
from app.schemas.bulk_import import BulkNewReferences, BulkNewVenue, BulkSeriesDraft
from app.services.imports.bulk.normalize import normalize_name

# Страны с листа «Справочники» шаблона: код в файле, название для карточки площадки.
AUTO_COUNTRY_NAMES: Final[dict[str, str]] = {
    "RU": "Россия",
    "BY": "Беларусь",
    "CY": "Кипр",
    "KZ": "Казахстан",
    "KG": "Кыргызстан",
    "AM": "Армения",
    "GE": "Грузия",
    "AZ": "Азербайджан",
}


@dataclass
class ReferenceResolution:
    organizers: dict[str, Organizer] = field(default_factory=dict)
    venues: dict[str, Venue] = field(default_factory=dict)
    countries: set[str] = field(default_factory=set)
    new_organizers: dict[str, str] = field(default_factory=dict)
    new_venues: dict[str, BulkNewVenue] = field(default_factory=dict)
    new_countries: set[str] = field(default_factory=set)

    def organizer_for(self, name: str) -> Organizer | None:
        return self.organizers.get(normalize_name(name))

    def venue_for(self, name: str) -> Venue | None:
        return self.venues.get(normalize_name(name))

    def as_new_references(self) -> BulkNewReferences:
        return BulkNewReferences(
            organizers=sorted(self.new_organizers.values()),
            venues=sorted(self.new_venues.values(), key=lambda item: item.name),
            countries=sorted(self.new_countries),
        )


async def resolve_references(
    session: AsyncSession,
    series_drafts: list[BulkSeriesDraft],
) -> ReferenceResolution:
    resolution = ReferenceResolution()
    if not series_drafts:
        return resolution

    organizer_names = {normalize_name(item.organizer_name) for item in series_drafts}
    venue_names = {normalize_name(item.venue_name) for item in series_drafts}
    country_codes = {item.country_code for item in series_drafts}

    for organizer in await session.scalars(select(Organizer)):
        key = normalize_name(organizer.name)
        if key in organizer_names:
            resolution.organizers.setdefault(key, organizer)

    for venue in await session.scalars(select(Venue)):
        key = normalize_name(venue.name)
        if key in venue_names:
            resolution.venues.setdefault(key, venue)

    resolution.countries = set(
        await session.scalars(select(Country.code).where(Country.code.in_(country_codes)))
    )

    for item in series_drafts:
        organizer_key = normalize_name(item.organizer_name)
        if organizer_key not in resolution.organizers:
            resolution.new_organizers.setdefault(organizer_key, item.organizer_name)
        venue_key = normalize_name(item.venue_name)
        if venue_key not in resolution.venues:
            resolution.new_venues.setdefault(
                venue_key,
                BulkNewVenue(
                    name=item.venue_name,
                    city=item.city,
                    country_code=item.country_code,
                    timezone=item.timezone,
                ),
            )
        if item.country_code not in resolution.countries:
            resolution.new_countries.add(item.country_code)

    return resolution
