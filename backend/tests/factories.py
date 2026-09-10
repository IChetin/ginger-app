import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import factory
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.enums import BookmarkTarget, EventStatus, GameType, SeriesStatus
from app.models.imports import ImportJob
from app.models.notifications import Bookmark
from app.models.references import Country, Currency, Organizer, Venue
from app.models.schedule import BlindLevel, Event, Flight, Series


class ModelFactory(factory.Factory):
    class Meta:
        abstract = True


class CountryFactory(ModelFactory):
    class Meta:
        model = Country

    code = factory.Sequence(lambda number: f"T{number % 10}")
    name_ru = factory.Sequence(lambda number: f"Тестовая страна {number}")


class CurrencyFactory(ModelFactory):
    class Meta:
        model = Currency

    code = factory.Sequence(lambda number: f"T{number:02d}"[-3:])
    symbol = "¤"


class OrganizerFactory(ModelFactory):
    class Meta:
        model = Organizer

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda number: f"Test Organizer {number}")
    slug = factory.Sequence(lambda number: f"test-organizer-{number}")
    links = factory.LazyFunction(dict)


class VenueFactory(ModelFactory):
    class Meta:
        model = Venue

    id = factory.LazyFunction(uuid.uuid4)
    country = factory.SubFactory(CountryFactory)
    city = "Тестовый город"
    name = factory.Sequence(lambda number: f"Тестовая площадка {number}")
    slug = factory.Sequence(lambda number: f"test-venue-{number}")
    zone = None
    timezone = "Europe/Moscow"


class UserFactory(ModelFactory):
    class Meta:
        model = User

    id = factory.LazyFunction(uuid.uuid4)
    email = factory.Sequence(lambda number: f"user{number}@example.com")
    nickname = factory.Sequence(lambda number: f"test_user_{number}")
    currency = factory.SubFactory(CurrencyFactory)


class SeriesFactory(ModelFactory):
    class Meta:
        model = Series

    id = factory.LazyFunction(uuid.uuid4)
    organizer = factory.SubFactory(OrganizerFactory)
    venue = factory.SubFactory(VenueFactory)
    name = factory.Sequence(lambda number: f"Test Series {number}")
    slug = factory.Sequence(lambda number: f"test-series-{number}")
    starts_on = factory.LazyFunction(date.today)
    ends_on = factory.LazyAttribute(lambda obj: obj.starts_on + timedelta(days=7))
    status = SeriesStatus.SCHEDULE_PUBLISHED
    links = factory.LazyFunction(dict)
    description = None
    poster_url = None


class EventFactory(ModelFactory):
    class Meta:
        model = Event

    id = factory.LazyFunction(uuid.uuid4)
    series = factory.SubFactory(SeriesFactory)
    number = factory.Sequence(lambda number: number + 1)
    name = factory.Sequence(lambda number: f"Test Event {number}")
    slug = factory.Sequence(lambda number: f"{number + 1}-test-event-{number}")
    buyin = Decimal("10000.00")
    buyin_bounty = None
    currency = factory.SubFactory(CurrencyFactory)
    guarantee = None
    game_type = GameType.NLH
    tags = factory.LazyFunction(list)
    start_stack = 30000
    start_blinds = None
    reentry_count = 1
    reentry_unlimited = False
    late_reg_level = 6
    day_end_note = None
    status = EventStatus.SCHEDULED
    notes = None


class FlightFactory(ModelFactory):
    class Meta:
        model = Flight

    id = factory.LazyFunction(uuid.uuid4)
    event = factory.SubFactory(EventFactory)
    label = None
    start_at = factory.LazyFunction(lambda: datetime.now(UTC) + timedelta(days=1))


class BlindLevelFactory(ModelFactory):
    class Meta:
        model = BlindLevel

    id = factory.LazyFunction(uuid.uuid4)
    event = factory.SubFactory(EventFactory)
    level_no = factory.Sequence(lambda number: number + 1)
    sb = 100
    bb = 200
    ante = 200
    minutes = 20
    is_break = False
    is_late_reg_end = False


class BookmarkFactory(ModelFactory):
    class Meta:
        model = Bookmark

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(UserFactory)
    target_type = BookmarkTarget.FLIGHT
    target_id = factory.LazyFunction(uuid.uuid4)
    reminder_offsets = factory.LazyFunction(lambda: [1440, 120])


class ImportJobFactory(ModelFactory):
    class Meta:
        model = ImportJob

    id = factory.LazyFunction(uuid.uuid4)
    uploader = factory.SubFactory(UserFactory)
    original_filename = "test.xlsx"
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    file_size = 4
    file_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    file_data = b"test"
    detected_type = "xlsx"
    import_kind = "schedule"


async def persist[T](session: AsyncSession, instance: T) -> T:
    session.add(instance)
    await session.flush()
    return instance
