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


class GameType(str, Enum):
    NLH = "nlh"
    PLO = "plo"
    PLO5 = "plo5"
    MIXED = "mixed"
    OTHER = "other"


class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationType(str, Enum):
    REMINDER = "reminder"
    # Ginger APP: заявки на фишки (пушим только итог — ТЗ §4.2а).
    CHIPS_ISSUED = "chips_issued"
    REQUISITES_READY = "requisites_ready"
    REQUEST_REJECTED = "request_rejected"
    WITHDRAWAL_SENT = "withdrawal_sent"
    NEW_CHIP_REQUEST = "new_chip_request"
    # Ginger APP: треды — менеджеру о новом сообщении игрока.
    NEW_THREAD_MESSAGE = "new_thread_message"
    # Ginger APP: ручная рассылка из админки (ТЗ §4.2б).
    BROADCAST = "broadcast"
    # Ginger APP: ответ менеджера игроку в диалоге (в Telegram — всегда, пушем — по настройке).
    THREAD_REPLY = "thread_reply"


class NotificationChannel(str, Enum):
    """Куда уходит уведомление: пуш приложения или Telegram-бот (второй канал, 15.09)."""

    PUSH = "push"
    TELEGRAM = "telegram"


class ReminderKind(str, Enum):
    """Колокольчик на турнире: за 5 минут до старта или до конца поздней регистрации."""

    START = "start"
    LATE_REG = "late_reg"


class ThreadTopic(str, Enum):
    QUESTION = "question"
    HAND_REVIEW = "hand_review"
    DATA_CHANGE = "data_change"
    CHIP_REQUEST = "chip_request"


class ThreadStatus(str, Enum):
    OPEN = "open"
    ANSWERED = "answered"
    CLOSED = "closed"


class AuthTokenPurpose(str, Enum):
    EMAIL_VERIFY = "email_verify"  # legacy; unused after split login/register
    PASSWORD_RESET = "password_reset"  # legacy; unused after split login/register
    LOGIN_ATTEMPT = "login_attempt"
    REGISTER = "register"  # short-lived proof after OTP; user_id NULL, email set
    ACCOUNT_LOOKUP = "account_lookup"  # existence-probe accounting (anti-enumeration captcha)


# --- Ginger APP: клубы и турниры ---


class PokerApp(str, Enum):
    """Приложение, в котором живёт клуб. Фильтр расписания по приложению — у игрока стоят не все."""

    PPPOKER = "pppoker"
    XPOKER = "xpoker"
    POKER21 = "poker21"
    SUPREMA = "suprema"
    OTHER = "other"


class ClubBlock(str, Enum):
    """Онлайн-клубы видны всем, офлайн — только игрокам с флагом доступа (ТЗ §7)."""

    ONLINE = "online"
    OFFLINE = "offline"


class BountyKind(str, Enum):
    NONE = "none"
    KO = "ko"
    PKO = "pko"
    MYSTERY = "mystery"


class TournamentStatus(str, Enum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"


# --- Ginger APP: игроки и заявки на фишки ---


class PlayerKind(str, Enum):
    """Кредитный — запросил и получил, расчёт раз в неделю; депозитный — оплатил и получил."""

    CREDIT = "credit"
    DEPOSIT = "deposit"


class PlayerStatus(str, Enum):
    ACTIVE = "active"
    BLOCKED = "blocked"
    ARCHIVED = "archived"


class PlayerAccountStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class ChipRequestKind(str, Enum):
    TOPUP = "topup"
    WITHDRAWAL = "withdrawal"


class ChipRequestStatus(str, Enum):
    SENT = "sent"
    ACCEPTED = "accepted"
    AWAITING_PAYMENT = "awaiting_payment"
    PAID = "paid"
    COMPLETED = "completed"
    REJECTED = "rejected"
    EXPIRED = "expired"


class CollectorRunKind(str, Enum):
    """Проход сборщика по лобби: утром турниры, вечером кэш-столы."""

    MTT = "mtt"
    CASH = "cash"


class CollectorRunStatus(str, Enum):
    RUNNING = "running"
    OK = "ok"
    FAILED = "failed"


class TournamentChangeKind(str, Enum):
    """Что сборщик нашёл в лобби и что требует решения человека."""

    NEW = "new"  # в лобби есть, в сетке нет
    MISSING = "missing"  # в сетке есть, в лобби нет
    CHANGED = "changed"  # бай-ин, гарантия, формат, игра или имя отличаются


class TournamentChangeStatus(str, Enum):
    PENDING = "pending"
    APPLIED = "applied"
    DISMISSED = "dismissed"
