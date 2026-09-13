from app.models import Base
from app.models.enums import (
    AuthTokenPurpose,
    BountyKind,
    ChipRequestKind,
    ChipRequestStatus,
    ClubBlock,
    GameType,
    NotificationStatus,
    NotificationType,
    PlayerAccountStatus,
    PlayerKind,
    PlayerStatus,
    PokerApp,
    ReminderKind,
    ThreadStatus,
    ThreadTopic,
    TournamentStatus,
    UserRole,
)

EXPECTED_TABLES = {
    "attachments",
    "auth_tokens",
    "chip_request_events",
    "chip_request_items",
    "chip_requests",
    "clubs",
    "currencies",
    "fx_rates",
    "invites",
    "notification_queue",
    "organizers",
    "otp_codes",
    "player_accounts",
    "players",
    "push_subscriptions",
    "requisite_templates",
    "sessions",
    "thread_messages",
    "threads",
    "tournament_reminders",
    "tournament_templates",
    "tournaments",
    "users",
}

EXPECTED_ENUMS = {
    AuthTokenPurpose,
    BountyKind,
    ChipRequestKind,
    ChipRequestStatus,
    ClubBlock,
    GameType,
    NotificationStatus,
    NotificationType,
    PlayerAccountStatus,
    PlayerKind,
    PlayerStatus,
    PokerApp,
    ReminderKind,
    ThreadStatus,
    ThreadTopic,
    TournamentStatus,
    UserRole,
}


def test_all_models_registered() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_all_enums_have_string_values() -> None:
    for enum_class in EXPECTED_ENUMS:
        assert all(isinstance(member.value, str) for member in enum_class)
