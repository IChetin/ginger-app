# ruff: noqa: UP042

from enum import Enum

from sqlalchemy import Enum as SQLAlchemyEnum


def pg_enum[EnumT: Enum](
    enum_class: type[EnumT],
    name: str,
) -> SQLAlchemyEnum:
    return SQLAlchemyEnum(
        enum_class,
        name=name,
        native_enum=True,
        values_callable=lambda members: [member.value for member in members],
    )


class UserRole(str, Enum):
    USER = "user"
    EDITOR = "editor"
    ADMIN = "admin"


class ResultsVisibility(str, Enum):
    PRIVATE = "private"
    ITM_ONLY = "itm_only"
    FULL = "full"


class StackDisplay(str, Enum):
    CHIPS = "chips"
    BB = "bb"


class HandInputMode(str, Enum):
    WIZARD = "wizard"
    TABLE = "table"


class CardDeck(str, Enum):
    CLASSIC = "classic"
    FOUR_COLOR = "four_color"


class SeriesStatus(str, Enum):
    ANNOUNCED = "announced"
    SCHEDULE_PUBLISHED = "schedule_published"
    RUNNING = "running"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class EventStatus(str, Enum):
    SCHEDULED = "scheduled"
    CHANGED = "changed"
    CANCELLED = "cancelled"


class GameType(str, Enum):
    NLH = "nlh"
    PLO = "plo"
    PLO5 = "plo5"
    MIXED = "mixed"
    OTHER = "other"


class EntryType(str, Enum):
    LIVE_MTT = "live_mtt"


class BookmarkTarget(str, Enum):
    SERIES = "series"
    FLIGHT = "flight"


class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationType(str, Enum):
    REMINDER = "reminder"
    SCHEDULE_PUBLISHED = "schedule_published"
    TIME_CHANGED = "time_changed"
    EVENT_CANCELLED = "event_cancelled"
    GUARANTEE_CHANGED = "guarantee_changed"
    SERIES_STARTING = "series_starting"
    SERIES_CANCELLED = "series_cancelled"


class ChangeType(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    CANCELLED = "cancelled"
    SCHEDULE_PUBLISHED = "schedule_published"


class ImportStatus(str, Enum):
    UPLOADED = "uploaded"
    PARSING = "parsing"
    REVIEW = "review"
    PUBLISHED = "published"
    FAILED = "failed"


class ImportKind(str, Enum):
    SCHEDULE = "schedule"
    STRUCTURES = "structures"
    BULK_XLSX = "bulk_xlsx"


class ParsePath(str, Enum):
    CODE = "code"
    AI = "ai"
    MIXED = "mixed"


class AuthTokenPurpose(str, Enum):
    EMAIL_VERIFY = "email_verify"  # legacy; unused after split login/register
    PASSWORD_RESET = "password_reset"  # legacy; unused after split login/register
    LOGIN_ATTEMPT = "login_attempt"
    REGISTER = "register"  # short-lived proof after OTP; user_id NULL, email set
    ACCOUNT_LOOKUP = "account_lookup"  # existence-probe accounting (anti-enumeration captcha)


class LiveSessionStatus(str, Enum):
    ACTIVE = "active"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class LiveEventType(str, Enum):
    ENTRY = "entry"
    REENTRY = "reentry"
    NOTE = "note"


class HandStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
