from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.email import normalize_email
from app.core.exceptions import (
    AccountExistsError,
    AccountNotFoundError,
    ConflictError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotFoundError,
    OtpExpiredError,
    OtpInvalidError,
    RateLimitError,
    UnauthorizedError,
)
from app.core.nickname import NICKNAME_TAKEN_MSG, normalize_nickname_key
from app.core.security import (
    advisory_lock_key,
    generate_auth_token,
    generate_otp_code,
    hash_auth_token,
    hash_ip,
    hash_otp_code,
    hash_password,
    mask_email,
    new_session_expiry,
    verify_auth_token,
    verify_otp_code,
    verify_password,
)
from app.core.system_accounts import is_system_user_email, is_system_user_id
from app.models.auth import AuthToken, OtpCode, Session, User
from app.models.enums import AuthTokenPurpose, UserRole
from app.schemas.auth import UpdateMeBody, UserMe
from app.services import captcha as captcha_service
from app.services import invites as invites_service
from app.services.email import EmailProvider, get_email_provider

logger = logging.getLogger(__name__)

_ACCOUNT_NOT_FOUND_MSG = "Аккаунт с таким email не найден. Зарегистрируйтесь"
_ACCOUNT_EXISTS_MSG = "Аккаунт с таким email уже есть. Войдите"
_LOGIN_LOCKOUT_MSG = "Слишком много неудачных попыток входа. Попробуйте снова через 15 минут"


@dataclass(frozen=True, slots=True)
class RequestOtpResult:
    expires_in_seconds: int
    retry_after: int


@dataclass(frozen=True, slots=True)
class RegisterVerifyResult:
    registration_token: str
    expires_in_seconds: int


async def _acquire_otp_locks(
    session: AsyncSession,
    *,
    email: str,
    ip_hash: str,
) -> None:
    email_key = advisory_lock_key("otp_email", email)
    ip_key = advisory_lock_key("otp_ip", ip_hash)
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": email_key})
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": ip_key})


async def _acquire_auth_locks(
    session: AsyncSession,
    *,
    namespace: str,
    email: str,
    ip_hash: str,
) -> None:
    email_key = advisory_lock_key(f"{namespace}_email", email)
    ip_key = advisory_lock_key(f"{namespace}_ip", ip_hash)
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": email_key})
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": ip_key})


def _resolve_otp_plaintext(settings: Settings) -> str:
    if settings.email_provider == "mock" and settings.allows_mock_email:
        return settings.dev_otp_code
    return generate_otp_code(length=6)


def _hours_word(hours: int) -> str:
    mod10 = hours % 10
    mod100 = hours % 100
    if mod10 == 1 and mod100 != 11:
        return "час"
    if 2 <= mod10 <= 4 and not 12 <= mod100 <= 14:
        return "часа"
    return "часов"


def _format_retry_hours(retry_after: int) -> str:
    hours = max(1, (retry_after + 3599) // 3600)
    return f"{hours} {_hours_word(hours)}"


def is_superadmin_email(email: str, settings: Settings | None = None) -> bool:
    cfg = settings or get_settings()
    return normalize_email(email) in cfg.superadmin_emails_list


def _visible_user(user: User | None) -> User | None:
    if user is None or is_system_user_id(user.id) or is_system_user_email(user.email):
        return None
    return user


async def _count_auth_tokens(
    session: AsyncSession,
    *,
    purpose: AuthTokenPurpose,
    user_id: UUID | None = None,
    ip_hash: str | None = None,
    email: str | None = None,
    since: datetime,
) -> int:
    stmt = (
        select(func.count())
        .select_from(AuthToken)
        .where(AuthToken.purpose == purpose, AuthToken.created_at >= since)
    )
    if user_id is not None:
        stmt = stmt.where(AuthToken.user_id == user_id)
    if ip_hash is not None:
        stmt = stmt.where(AuthToken.request_ip_hash == ip_hash)
    if email is not None:
        stmt = stmt.where(AuthToken.email == email)
    return int(await session.scalar(stmt) or 0)


async def _record_account_lookup(
    session: AsyncSession,
    *,
    email: str,
    ip_hash: str,
    settings: Settings,
) -> None:
    now = datetime.now(UTC)
    session.add(
        AuthToken(
            user_id=None,
            email=email,
            purpose=AuthTokenPurpose.ACCOUNT_LOOKUP,
            token_hash=hash_auth_token(
                f"lookup:{email}:{now.isoformat()}:{ip_hash}",
                secret=settings.otp_hmac_secret,
            ),
            request_ip_hash=ip_hash,
            expires_at=now + timedelta(hours=1),
            used_at=now,
        )
    )
    await session.flush()


async def _enforce_account_lookup_captcha(
    session: AsyncSession,
    *,
    ip_hash: str,
    client_ip: str,
    captcha_token: str | None,
    settings: Settings,
) -> None:
    hour_start = datetime.now(UTC) - timedelta(hours=1)
    lookup_count = await _count_auth_tokens(
        session,
        purpose=AuthTokenPurpose.ACCOUNT_LOOKUP,
        ip_hash=ip_hash,
        since=hour_start,
    )
    if lookup_count >= settings.account_lookup_ip_hourly_limit:
        raise RateLimitError(
            "Слишком много запросов. Попробуйте позже",
            retry_after=settings.otp_min_interval_seconds,
        )
    captcha_required = lookup_count >= settings.account_lookup_captcha_after_count
    await captcha_service.verify_captcha_token(
        captcha_token,
        client_ip=client_ip,
        required=captcha_required,
        settings=settings,
    )


async def _enforce_otp_rate_limits(
    session: AsyncSession,
    *,
    email: str,
    ip_hash: str,
    now: datetime,
    settings: Settings,
) -> None:
    min_interval = timedelta(seconds=settings.otp_min_interval_seconds)
    recent = await session.scalar(
        select(OtpCode).where(OtpCode.email == email).order_by(OtpCode.created_at.desc()).limit(1)
    )
    if recent is not None and recent.created_at >= now - min_interval:
        elapsed = int((now - recent.created_at).total_seconds())
        retry_after = max(1, settings.otp_min_interval_seconds - elapsed)
        raise RateLimitError(
            "Код уже отправлен. Подождите перед повторной отправкой",
            retry_after=retry_after,
        )

    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    daily_count = int(
        await session.scalar(
            select(func.count())
            .select_from(OtpCode)
            .where(OtpCode.email == email, OtpCode.created_at >= day_start)
        )
        or 0
    )
    if daily_count >= settings.otp_daily_limit:
        next_day = day_start + timedelta(days=1)
        retry_after = max(1, int((next_day - now).total_seconds()))
        raise RateLimitError(
            "Слишком много запросов кода. Попробуйте через "
            f"{_format_retry_hours(retry_after)} или войдите по паролю",
            retry_after=retry_after,
        )

    hour_start = now - timedelta(hours=1)
    ip_count = int(
        await session.scalar(
            select(func.count())
            .select_from(OtpCode)
            .where(
                OtpCode.request_ip_hash == ip_hash,
                OtpCode.created_at >= hour_start,
            )
        )
        or 0
    )
    if ip_count >= settings.otp_ip_hourly_limit:
        raise RateLimitError(
            "Слишком много запросов кода с этого устройства. Попробуйте позже",
            retry_after=settings.otp_min_interval_seconds,
        )


async def _otp_captcha_required(session: AsyncSession, *, email: str, settings: Settings) -> bool:
    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    daily_count = int(
        await session.scalar(
            select(func.count())
            .select_from(OtpCode)
            .where(OtpCode.email == email, OtpCode.created_at >= day_start)
        )
        or 0
    )
    return daily_count >= settings.otp_captcha_after_count


async def _issue_otp(
    session: AsyncSession,
    *,
    email: str,
    ip_hash: str,
    client_ip: str,
    captcha_token: str | None,
    settings: Settings,
    email_provider: EmailProvider | None,
) -> RequestOtpResult:
    now = datetime.now(UTC)
    await _enforce_otp_rate_limits(
        session, email=email, ip_hash=ip_hash, now=now, settings=settings
    )
    captcha_required = await _otp_captcha_required(session, email=email, settings=settings)
    await captcha_service.verify_captcha_token(
        captcha_token,
        client_ip=client_ip,
        required=captcha_required,
        settings=settings,
    )

    provider = email_provider or get_email_provider(settings)
    code = _resolve_otp_plaintext(settings)
    expires_at = now + timedelta(seconds=settings.otp_ttl_seconds)
    code_hash = hash_otp_code(code, secret=settings.otp_hmac_secret)

    await provider.send_code(email, code)
    session.add(
        OtpCode(
            email=email,
            code_hash=code_hash,
            request_ip_hash=ip_hash,
            attempts=0,
            expires_at=expires_at,
        )
    )
    await session.flush()
    logger.info("otp issued for %s via %s", mask_email(email), getattr(provider, "name", "?"))
    return RequestOtpResult(
        expires_in_seconds=settings.otp_ttl_seconds,
        retry_after=settings.otp_min_interval_seconds,
    )


async def _consume_otp(
    session: AsyncSession,
    *,
    email: str,
    code: str,
    settings: Settings,
) -> None:
    email_key = advisory_lock_key("otp_email", email)
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": email_key})

    now = datetime.now(UTC)
    otp = await session.scalar(
        select(OtpCode)
        .where(OtpCode.email == email, OtpCode.used_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    if otp is None:
        raise OtpExpiredError("Код не найден. Запросите новый")
    if otp.expires_at < now:
        raise OtpExpiredError("Код истёк. Запросите новый")
    if otp.attempts >= settings.otp_max_attempts:
        raise RateLimitError(
            "Слишком много попыток ввода кода. Запросите новый",
            retry_after=settings.otp_min_interval_seconds,
        )

    if not verify_otp_code(code, otp.code_hash, secret=settings.otp_hmac_secret):
        otp.attempts += 1
        await session.flush()
        attempts_left = max(0, settings.otp_max_attempts - otp.attempts)
        if attempts_left == 0:
            raise RateLimitError(
                "Слишком много попыток ввода кода. Запросите новый",
                retry_after=settings.otp_min_interval_seconds,
            )
        raise OtpInvalidError("Неверный код", attempts_left=attempts_left)

    otp.used_at = now
    await session.execute(
        update(OtpCode)
        .where(
            OtpCode.email == email,
            OtpCode.used_at.is_(None),
            OtpCode.id != otp.id,
        )
        .values(used_at=now)
    )
    await session.flush()


async def _nickname_taken(
    session: AsyncSession,
    nickname: str,
    *,
    exclude_user_id: UUID | None = None,
) -> bool:
    key = normalize_nickname_key(nickname)
    stmt = select(User.id).where(func.lower(User.nickname) == key)
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return await session.scalar(stmt) is not None


async def _create_user(
    session: AsyncSession,
    *,
    email: str,
    nickname: str,
    password_hash: str | None,
    settings: Settings,
) -> User:
    role = UserRole.USER
    if is_superadmin_email(email, settings):
        role = UserRole.ADMIN
    elif settings.is_development:
        if email == normalize_email(settings.seed_admin_email):
            role = UserRole.ADMIN
        elif email == normalize_email(settings.seed_editor_email):
            role = UserRole.EDITOR

    user = User(
        email=email,
        nickname=nickname,
        password_hash=password_hash,
        role=role,
        email_verified_at=datetime.now(UTC),
    )
    session.add(user)
    await session.flush()
    return user


async def _create_auth_session(
    session: AsyncSession,
    user: User,
    *,
    user_agent: str | None,
    settings: Settings,
) -> Session:
    if is_superadmin_email(user.email, settings) and user.role != UserRole.ADMIN:
        old_role = user.role
        user.role = UserRole.ADMIN
        await session.flush()
        logger.info(
            "superadmin role enforced user_id=%s old_role=%s",
            user.id,
            old_role.value,
        )

    now = datetime.now(UTC)
    auth_session = Session(
        user_id=user.id,
        user_agent=user_agent,
        expires_at=new_session_expiry(settings),
        last_seen_at=now,
    )
    session.add(auth_session)
    await session.flush()
    return auth_session


async def request_otp(
    session: AsyncSession,
    *,
    email: str,
    client_ip: str,
    captcha_token: str | None = None,
    settings: Settings | None = None,
    email_provider: EmailProvider | None = None,
) -> RequestOtpResult:
    """Send login OTP only when the account already exists."""
    settings = settings or get_settings()
    email = normalize_email(email)
    ip_hash = hash_ip(client_ip, secret=settings.otp_hmac_secret)
    await _acquire_otp_locks(session, email=email, ip_hash=ip_hash)

    await _enforce_account_lookup_captcha(
        session,
        ip_hash=ip_hash,
        client_ip=client_ip,
        captcha_token=captcha_token,
        settings=settings,
    )

    user = _visible_user(await session.scalar(select(User).where(User.email == email)))
    if user is None:
        await _record_account_lookup(session, email=email, ip_hash=ip_hash, settings=settings)
        raise AccountNotFoundError(_ACCOUNT_NOT_FOUND_MSG)

    return await _issue_otp(
        session,
        email=email,
        ip_hash=ip_hash,
        client_ip=client_ip,
        captcha_token=captcha_token,
        settings=settings,
        email_provider=email_provider,
    )


async def verify_otp(
    session: AsyncSession,
    *,
    email: str,
    code: str,
    user_agent: str | None,
    settings: Settings | None = None,
) -> tuple[Session, User]:
    """Login via OTP for an existing account. Never creates users."""
    settings = settings or get_settings()
    email = normalize_email(email)

    user = _visible_user(await session.scalar(select(User).where(User.email == email)))
    if user is None:
        raise AccountNotFoundError(_ACCOUNT_NOT_FOUND_MSG)

    await _consume_otp(session, email=email, code=code, settings=settings)

    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
        await session.flush()

    auth_session = await _create_auth_session(
        session, user, user_agent=user_agent, settings=settings
    )
    return auth_session, user


async def register_start(
    session: AsyncSession,
    *,
    email: str,
    client_ip: str,
    captcha_token: str | None = None,
    settings: Settings | None = None,
    email_provider: EmailProvider | None = None,
    invite_token: str | None = None,
) -> RequestOtpResult:
    """Start registration: send OTP only when the account does not exist."""
    settings = settings or get_settings()
    if settings.registration_requires_invite:
        await invites_service.require_active_invite(session, invite_token)
    email = normalize_email(email)
    ip_hash = hash_ip(client_ip, secret=settings.otp_hmac_secret)
    await _acquire_otp_locks(session, email=email, ip_hash=ip_hash)

    await _enforce_account_lookup_captcha(
        session,
        ip_hash=ip_hash,
        client_ip=client_ip,
        captcha_token=captcha_token,
        settings=settings,
    )

    if is_system_user_email(email) or await session.scalar(select(User).where(User.email == email)):
        await _record_account_lookup(session, email=email, ip_hash=ip_hash, settings=settings)
        raise AccountExistsError(_ACCOUNT_EXISTS_MSG)

    return await _issue_otp(
        session,
        email=email,
        ip_hash=ip_hash,
        client_ip=client_ip,
        captcha_token=captcha_token,
        settings=settings,
        email_provider=email_provider,
    )


async def register_verify(
    session: AsyncSession,
    *,
    email: str,
    code: str,
    client_ip: str,
    settings: Settings | None = None,
) -> RegisterVerifyResult:
    """Confirm email via OTP without creating a user; issue registration_token."""
    settings = settings or get_settings()
    email = normalize_email(email)
    ip_hash = hash_ip(client_ip, secret=settings.otp_hmac_secret)

    user = await session.scalar(select(User).where(User.email == email))
    if user is not None or is_system_user_email(email):
        raise AccountExistsError(_ACCOUNT_EXISTS_MSG)

    await _consume_otp(session, email=email, code=code, settings=settings)

    now = datetime.now(UTC)
    # Invalidate previous unused register tokens for this email.
    await session.execute(
        update(AuthToken)
        .where(
            AuthToken.email == email,
            AuthToken.purpose == AuthTokenPurpose.REGISTER,
            AuthToken.used_at.is_(None),
        )
        .values(used_at=now)
    )

    raw_token = generate_auth_token()
    session.add(
        AuthToken(
            user_id=None,
            email=email,
            purpose=AuthTokenPurpose.REGISTER,
            token_hash=hash_auth_token(raw_token, secret=settings.otp_hmac_secret),
            request_ip_hash=ip_hash,
            expires_at=now + timedelta(seconds=settings.register_token_ttl_seconds),
        )
    )
    await session.flush()
    return RegisterVerifyResult(
        registration_token=raw_token,
        expires_in_seconds=settings.register_token_ttl_seconds,
    )


async def register_complete(
    session: AsyncSession,
    *,
    registration_token: str,
    password: str,
    nickname: str,
    user_agent: str | None,
    settings: Settings | None = None,
    invite_token: str | None = None,
) -> tuple[Session, User]:
    """Create account after email proof + password + nickname."""
    settings = settings or get_settings()
    now = datetime.now(UTC)
    token_hash = hash_auth_token(registration_token, secret=settings.otp_hmac_secret)
    auth_token = await session.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == token_hash,
            AuthToken.purpose == AuthTokenPurpose.REGISTER,
        )
    )
    if (
        auth_token is None
        or auth_token.used_at is not None
        or auth_token.expires_at < now
        or auth_token.email is None
        or not verify_auth_token(
            registration_token, auth_token.token_hash, secret=settings.otp_hmac_secret
        )
    ):
        raise InvalidTokenError("Код подтверждения истёк. Начните регистрацию заново")

    email = auth_token.email
    email_key = advisory_lock_key("register_complete", email)
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": email_key})

    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        auth_token.used_at = now
        await session.flush()
        raise AccountExistsError(_ACCOUNT_EXISTS_MSG)

    if await _nickname_taken(session, nickname):
        raise ConflictError(NICKNAME_TAKEN_MSG)

    invite = None
    if settings.registration_requires_invite or invite_token:
        invite = await invites_service.require_active_invite(session, invite_token, lock=True)

    auth_token.used_at = now
    user = await _create_user(
        session,
        email=email,
        nickname=nickname,
        password_hash=hash_password(password),
        settings=settings,
    )
    if invite is not None:
        await invites_service.consume_invite(session, invite, user)
    auth_session = await _create_auth_session(
        session, user, user_agent=user_agent, settings=settings
    )
    return auth_session, user


async def login_with_password(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    client_ip: str,
    user_agent: str | None,
    settings: Settings | None = None,
) -> tuple[Session, User]:
    settings = settings or get_settings()
    email = normalize_email(email)
    ip_hash = hash_ip(client_ip, secret=settings.otp_hmac_secret)
    await _acquire_auth_locks(session, namespace="password_login", email=email, ip_hash=ip_hash)

    now = datetime.now(UTC)
    window_start = now - timedelta(seconds=settings.password_login_lockout_seconds)
    user = _visible_user(await session.scalar(select(User).where(User.email == email)))

    if user is not None:
        attempt_count = await _count_auth_tokens(
            session,
            purpose=AuthTokenPurpose.LOGIN_ATTEMPT,
            user_id=user.id,
            since=window_start,
        )
        if attempt_count >= settings.password_login_max_attempts:
            raise RateLimitError(
                _LOGIN_LOCKOUT_MSG,
                retry_after=settings.password_login_lockout_seconds,
            )

    ip_attempts = await _count_auth_tokens(
        session,
        purpose=AuthTokenPurpose.LOGIN_ATTEMPT,
        ip_hash=ip_hash,
        since=window_start,
    )
    if ip_attempts >= settings.password_login_max_attempts:
        raise RateLimitError(
            _LOGIN_LOCKOUT_MSG,
            retry_after=settings.password_login_lockout_seconds,
        )

    password_ok = (
        user is not None
        and user.password_hash is not None
        and verify_password(password, user.password_hash)
    )
    if not password_ok:
        session.add(
            AuthToken(
                user_id=user.id if user is not None else None,
                email=email,
                purpose=AuthTokenPurpose.LOGIN_ATTEMPT,
                token_hash=hash_auth_token(
                    f"fail:{email}:{now.isoformat()}",
                    secret=settings.otp_hmac_secret,
                ),
                request_ip_hash=ip_hash,
                expires_at=now + timedelta(seconds=settings.password_login_lockout_seconds),
                used_at=now,
            )
        )
        await session.flush()
        raise InvalidCredentialsError()

    assert user is not None
    if user.email_verified_at is None:
        # Should not happen for new registrations; treat as invalid credentials.
        raise InvalidCredentialsError()

    auth_session = await _create_auth_session(
        session, user, user_agent=user_agent, settings=settings
    )
    return auth_session, user


async def set_password(
    session: AsyncSession,
    user: User,
    *,
    password: str,
) -> User:
    """Set or replace password for the current session (OTP / first-time)."""
    user.password_hash = hash_password(password)
    await session.flush()
    await session.refresh(user)
    return user


async def change_password(
    session: AsyncSession,
    user: User,
    *,
    current_password: str,
    new_password: str,
) -> User:
    if user.password_hash is None or not verify_password(current_password, user.password_hash):
        raise InvalidCredentialsError("Неверный текущий пароль")
    user.password_hash = hash_password(new_password)
    await session.flush()
    await session.refresh(user)
    return user


async def get_user_by_session_id(
    session: AsyncSession,
    session_id: UUID,
    *,
    settings: Settings | None = None,
) -> tuple[User, UUID]:
    settings = settings or get_settings()
    now = datetime.now(UTC)
    auth_session = await session.scalar(
        select(Session).where(Session.id == session_id).options(selectinload(Session.user))
    )
    if auth_session is None or auth_session.expires_at < now:
        raise UnauthorizedError("Сессия истекла. Войдите снова")

    auth_session.last_seen_at = now
    auth_session.expires_at = new_session_expiry(settings)
    user = auth_session.user
    if is_superadmin_email(user.email, settings) and user.role != UserRole.ADMIN:
        old_role = user.role
        user.role = UserRole.ADMIN
        logger.info(
            "superadmin role enforced on session touch user_id=%s old_role=%s",
            user.id,
            old_role.value,
        )
    await session.flush()
    return user, auth_session.id


async def logout_session(session: AsyncSession, session_id: UUID) -> None:
    auth_session = await session.scalar(select(Session).where(Session.id == session_id))
    if auth_session is None:
        raise NotFoundError("Сессия не найдена")
    await session.delete(auth_session)
    await session.flush()


async def update_profile(
    session: AsyncSession,
    user: User,
    body: UpdateMeBody,
) -> User:
    if body.nickname is not None and body.nickname != user.nickname:
        key_changed = normalize_nickname_key(body.nickname) != normalize_nickname_key(user.nickname)
        if key_changed and await _nickname_taken(session, body.nickname, exclude_user_id=user.id):
            raise ConflictError(NICKNAME_TAKEN_MSG)
        user.nickname = body.nickname

    if body.schedule_view is not None:
        user.schedule_view = body.schedule_view

    await session.flush()
    await session.refresh(user)
    return user


def user_to_me(user: User) -> UserMe:
    return UserMe(
        id=user.id,
        email=user.email,
        phone=user.phone,
        nickname=user.nickname,
        schedule_view="table" if user.schedule_view == "table" else "cards",
        role=user.role,
        email_verified=user.email_verified_at is not None,
        has_password=user.password_hash is not None,
        created_at=user.created_at,
    )
