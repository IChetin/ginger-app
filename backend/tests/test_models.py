from app.models import Base
from app.models.enums import (
    AuthTokenPurpose,
    BookmarkTarget,
    ChangeType,
    EntryType,
    EventStatus,
    GameType,
    ImportKind,
    ImportStatus,
    NotificationStatus,
    NotificationType,
    ParsePath,
    SeriesStatus,
    UserRole,
)

# Сверено с базой после миграции 1ede63461589 (удаление реплеера, трекера и live).
# parser_profiles и slug_redirects в исходном списке Day2 отсутствовали — добавлены.
EXPECTED_TABLES = {
    "auth_tokens",
    "blind_levels",
    "bookmarks",
    "change_log",
    "countries",
    "currencies",
    "events",
    "flights",
    "fx_rates",
    "import_jobs",
    "notification_queue",
    "organizers",
    "otp_codes",
    "parser_profiles",
    "push_subscriptions",
    "series",
    "sessions",
    "slug_redirects",
    "users",
    "venues",
}

EXPECTED_ENUMS = {
    UserRole,
    SeriesStatus,
    EventStatus,
    GameType,
    EntryType,
    BookmarkTarget,
    NotificationStatus,
    NotificationType,
    ChangeType,
    ImportStatus,
    ImportKind,
    ParsePath,
    AuthTokenPurpose,
}


def test_all_models_registered() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_all_enums_have_string_values() -> None:
    assert len(EXPECTED_ENUMS) == 13
    for enum_class in EXPECTED_ENUMS:
        assert all(isinstance(member.value, str) for member in enum_class)
