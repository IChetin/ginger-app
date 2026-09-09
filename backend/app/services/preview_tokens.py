from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.core.config import Settings
from app.core.exceptions import AppError


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def hash_canonical(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_preview_token(
    *,
    actor_id: UUID,
    entity_type: str,
    entity_id: UUID,
    snapshot_hash: str,
    body_hash: str,
    settings: Settings,
) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.preview_token_ttl_seconds)
    payload = {
        "actor_id": str(actor_id),
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "snapshot_hash": snapshot_hash,
        "body_hash": body_hash,
        "exp": int(expires_at.timestamp()),
    }
    payload_b64 = _b64url_encode(canonical_json(payload).encode("utf-8"))
    signature = hmac.new(
        settings.preview_hmac_secret.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    token = f"{payload_b64}.{_b64url_encode(signature)}"
    return token, expires_at


def verify_preview_token(
    token: str,
    *,
    actor_id: UUID,
    entity_type: str,
    entity_id: UUID,
    snapshot_hash: str,
    body_hash: str,
    settings: Settings,
) -> None:
    try:
        payload_b64, signature_b64 = token.split(".", maxsplit=1)
    except ValueError as exc:
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        ) from exc

    expected_sig = hmac.new(
        settings.preview_hmac_secret.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        provided_sig = _b64url_decode(signature_b64)
    except (ValueError, TypeError) as exc:
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        ) from exc

    if not hmac.compare_digest(expected_sig, provided_sig):
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        )

    try:
        payload_raw = _b64url_decode(payload_b64).decode("utf-8")
        payload = json.loads(payload_raw)
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        ) from exc

    if not isinstance(payload, dict):
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        )

    try:
        exp = int(payload["exp"])
        token_actor = UUID(str(payload["actor_id"]))
        token_entity_type = str(payload["entity_type"])
        token_entity_id = UUID(str(payload["entity_id"]))
        token_snapshot_hash = str(payload["snapshot_hash"])
        token_body_hash = str(payload["body_hash"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        ) from exc

    if token_actor != actor_id or token_entity_type != entity_type or token_entity_id != entity_id:
        raise AppError(
            code="preview_invalid",
            message="Invalid preview token",
            status_code=400,
        )

    now_ts = int(datetime.now(UTC).timestamp())
    if exp < now_ts:
        raise AppError(
            code="preview_stale",
            message="Preview token expired",
            status_code=409,
        )

    if token_snapshot_hash != snapshot_hash or token_body_hash != body_hash:
        raise AppError(
            code="preview_stale",
            message="Preview is stale; request a new preview",
            status_code=409,
        )
