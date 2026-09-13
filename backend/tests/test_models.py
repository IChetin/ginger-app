from app.models import Base
from app.models.enums import (
    AuthTokenPurpose,
    BookmarkTarget,
    BountyKind,
    ChangeType,
    ChipRequestKind,
    ChipRequestStatus,
    ClubBlock,
    EntryType,
    EventStatus,
    GameType,
    ImportKind,
    ImportStatus,
    NotificationStatus,
    NotificationType,
    ParsePath,
    PlayerAccountStatus,
    PlayerKind,
    PlayerStatus,
    PokerApp,
    SeriesStatus,
    TournamentStatus,
    UserRole,
)

# Сверено с базой после миграции 2a7c9e41b3d0 (клубы, шаблоны, турниры Ginger APP).
# parser_profiles и slug_redirects в исходном списке Day2 отсутствовали — добавлены.
EXPECTED_TABLES = {
    "auth_tokens",
    "blind_levels",
    "bookmarks",
    "change_log",
    "chip_request_events",
    "chip_request_items",
    "chip_requests",
    "attachments",
    "clubs",
    "countries",
    "currencies",
    "events",
    "flights",
    "fx_rates",
    "import_jobs",
    "invites",
    "notification_queue",
    "organizers",
    "otp_codes",
    "parser_profiles",
    "player_accounts",
    "players",
    "push_subscriptions",
    "requisite_templates",
    "series",
    "sessions",
    "slug_redirects",
    "tournament_templates",
    "tournaments",
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
    PokerApp,
    ClubBlock,
    BountyKind,
    TournamentStatus,
    PlayerKind,
    PlayerStatus,
    PlayerAccountStatus,
    ChipRequestKind,
    ChipRequestStatus,
}


def test_all_models_registered() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_all_enums_have_string_values() -> None:
    assert len(EXPECTED_ENUMS) == 22
    for enum_class in EXPECTED_ENUMS:
        assert all(isinstance(member.value, str) for member in enum_class)
