import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    AuthTokenPurpose,
    UserRole,
    pg_enum,
)

if TYPE_CHECKING:
    from app.models.imports import ImportJob
    from app.models.notifications import Bookmark, NotificationQueue
    from app.models.references import Currency
    from app.models.schedule import ChangeLog


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    phone: Mapped[str | None] = mapped_column(
        String(16),
        comment="Optional contact phone reserved for phase 3",
    )
    # Uniqueness is case-insensitive via uq_users_nickname_lower (lower(nickname)).
    nickname: Mapped[str] = mapped_column(String(32), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    base_currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"),
        nullable=False,
        server_default=text("'RUB'"),
    )
    timezone: Mapped[str | None] = mapped_column(
        String(64),
        comment="IANA timezone; NULL = detect from browser",
    )
    # Ginger APP: вид расписания турниров — карточки или плотная таблица (как лобби Покерка).
    schedule_view: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'cards'"),
    )
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"),
        nullable=False,
        server_default=text("'user'"),
    )
    default_reminder_offsets: Mapped[list[int]] = mapped_column(
        ARRAY(Integer),
        nullable=False,
        server_default=text("'{1440,120}'::integer[]"),
    )

    __table_args__ = (Index("uq_users_nickname_lower", func.lower(nickname), unique=True),)

    currency: Mapped["Currency"] = relationship(back_populates="users")
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    auth_tokens: Mapped[list["AuthToken"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    push_subscriptions: Mapped[list["PushSubscription"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    bookmarks: Mapped[list["Bookmark"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    notifications: Mapped[list["NotificationQueue"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    changes: Mapped[list["ChangeLog"]] = relationship(back_populates="actor")
    import_jobs: Mapped[list["ImportJob"]] = relationship(back_populates="uploader")


class OtpCode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "otp_codes"
    __table_args__ = (
        CheckConstraint("attempts >= 0 AND attempts <= 5", name="attempts_range"),
        Index("ix_otp_codes_email_created_at", "email", "created_at"),
        Index("ix_otp_codes_request_ip_hash_created_at", "request_ip_hash", "created_at"),
    )

    email: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    request_ip_hash: Mapped[str | None] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default=text("0"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class Session(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_agent: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="sessions")


class AuthToken(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "auth_tokens"
    __table_args__ = (
        Index("ix_auth_tokens_user_purpose_created_at", "user_id", "purpose", "created_at"),
        Index("ix_auth_tokens_token_hash", "token_hash"),
        Index("ix_auth_tokens_request_ip_hash_created_at", "request_ip_hash", "created_at"),
        Index("ix_auth_tokens_email_purpose_created_at", "email", "purpose", "created_at"),
    )

    # NULL for register / account_lookup probes (no user row yet).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Set for register tokens and account_lookup probes.
    email: Mapped[str | None] = mapped_column(String(255))
    purpose: Mapped[AuthTokenPurpose] = mapped_column(
        pg_enum(AuthTokenPurpose, "auth_token_purpose"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    request_ip_hash: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped[User | None] = relationship(back_populates="auth_tokens")


class PushSubscription(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    device_label: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="push_subscriptions")
