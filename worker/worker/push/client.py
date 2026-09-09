from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from pywebpush import WebPushException, webpush

from worker.config import Settings

logger = logging.getLogger("day2.worker.push")


class PushOutcome(StrEnum):
    SUCCESS = "success"
    GONE = "gone"
    RETRYABLE = "retryable"
    FATAL = "fatal"


@dataclass(frozen=True, slots=True)
class PushSendResult:
    outcome: PushOutcome
    status_code: int | None = None
    error: str | None = None


def send_web_push(
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    payload: dict[str, Any],
    settings: Settings,
) -> PushSendResult:
    if not settings.vapid_private_key:
        return PushSendResult(outcome=PushOutcome.FATAL, error="vapid_not_configured")

    try:
        response = webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=60 * 60,
        )
        status = getattr(response, "status_code", 201)
        if status and int(status) >= 400:
            return _classify_status(int(status), "push_failed")
        return PushSendResult(outcome=PushOutcome.SUCCESS, status_code=int(status or 201))
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        # Never log endpoint/keys.
        logger.warning("webpush failed status=%s", status)
        if status is None:
            return PushSendResult(outcome=PushOutcome.RETRYABLE, error="network_error")
        return _classify_status(status, "webpush_exception")
    except Exception:
        logger.exception("unexpected webpush error")
        return PushSendResult(outcome=PushOutcome.RETRYABLE, error="unexpected_error")


def _classify_status(status: int, default_error: str) -> PushSendResult:
    if status in {404, 410}:
        return PushSendResult(outcome=PushOutcome.GONE, status_code=status, error="gone")
    if status in {401, 403}:
        return PushSendResult(outcome=PushOutcome.FATAL, status_code=status, error="vapid_rejected")
    if status in {408, 429} or status >= 500:
        return PushSendResult(
            outcome=PushOutcome.RETRYABLE,
            status_code=status,
            error=default_error,
        )
    return PushSendResult(outcome=PushOutcome.FATAL, status_code=status, error=default_error)
