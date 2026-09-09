import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import Settings

_password_hasher = PasswordHasher()


def hash_otp_code(code: str, *, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), code.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_otp_code(code: str, code_hash: str, *, secret: str) -> bool:
    expected = hash_otp_code(code, secret=secret)
    return hmac.compare_digest(expected, code_hash)


def generate_otp_code(*, length: int = 6) -> str:
    upper = 10**length
    return f"{secrets.randbelow(upper):0{length}d}"


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def generate_auth_token() -> str:
    return secrets.token_urlsafe(32)


def hash_auth_token(token: str, *, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_auth_token(token: str, token_hash: str, *, secret: str) -> bool:
    expected = hash_auth_token(token, secret=secret)
    return hmac.compare_digest(expected, token_hash)


def hash_ip(ip: str, *, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), ip.encode("utf-8"), hashlib.sha256).hexdigest()


def new_session_expiry(settings: Settings) -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.session_ttl_days)


def mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if not local:
        masked_local = "••••"
    elif len(local) == 1:
        masked_local = f"{local[0]}••••"
    else:
        masked_local = f"{local[0]}••••"
    return f"{masked_local}@{domain}"


def mask_phone(phone: str) -> str:
    if len(phone) <= 4:
        return "***"
    return f"{phone[:3]}***{phone[-2:]}"


def parse_session_id(raw: str | None) -> UUID | None:
    if raw is None or not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None


def advisory_lock_key(namespace: str, value: str) -> int:
    digest = hashlib.sha256(f"{namespace}:{value}".encode()).digest()
    # Signed 64-bit int for pg_advisory_xact_lock
    return int.from_bytes(digest[:8], "big", signed=True)
