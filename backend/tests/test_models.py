from app.models import Base
from app.models.enums import (
    AuthTokenPurpose,
    BookmarkTarget,
    ChangeType,
    EntryType,
    EventStatus,
    GameType,
    HandStatus,
    ImportKind,
    ImportStatus,
    NotificationStatus,
    NotificationType,
    ParsePath,
    ResultsVisibility,
    SeriesStatus,
    UserRole,
)

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
    "push_subscriptions",
    "results",
    "series",
    "sessions",
    "users",
    "venues",
}

EXPECTED_ENUMS = {
    UserRole,
    ResultsVisibility,
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
    HandStatus,
}


def test_all_models_registered() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_all_enums_have_string_values() -> None:
    assert len(EXPECTED_ENUMS) == 15
    for enum_class in EXPECTED_ENUMS:
        assert all(isinstance(member.value, str) for member in enum_class)
