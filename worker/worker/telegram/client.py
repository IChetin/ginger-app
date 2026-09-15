"""Отправка уведомления в Telegram-бот — второй канал после пуша (решение 15.09)."""

from __future__ import annotations

import contextlib
import json
import logging
from html import escape
from typing import Any
from urllib import error, request

from worker.config import Settings
from worker.push.client import PushOutcome, PushSendResult

logger = logging.getLogger("ginger.worker.telegram")

API_BASE = "https://api.telegram.org"


def build_message(payload: dict[str, Any], base_url: str) -> dict[str, Any]:
    """Сообщение бота: заголовок жирным, текст, кнопка «Открыть в Ginger».

    Кнопка-ссылка в Telegram принимает только https — на локальном стенде её нет.
    """
    title = escape(str(payload.get("title") or "Ginger"))
    body = escape(str(payload.get("body") or ""))
    message: dict[str, Any] = {
        "text": f"<b>{title}</b>\n{body}" if body else f"<b>{title}</b>",
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    url = str(payload.get("url") or "/")
    if base_url.startswith("https://") and url.startswith("/") and not url.startswith("//"):
        message["reply_markup"] = {
            "inline_keyboard": [[{"text": "Открыть в Ginger", "url": base_url.rstrip("/") + url}]]
        }
    return message


def classify(status: int, description: str) -> PushSendResult:
    lowered = description.lower()
    if status == 403 or (
        status == 400 and ("chat not found" in lowered or "user is deactivated" in lowered)
    ):
        return PushSendResult(
            outcome=PushOutcome.GONE, status_code=status, error="chat_unavailable"
        )
    if status == 429 or status >= 500:
        return PushSendResult(
            outcome=PushOutcome.RETRYABLE, status_code=status, error="telegram_retry"
        )
    return PushSendResult(outcome=PushOutcome.FATAL, status_code=status, error="telegram_rejected")


def send_telegram(*, chat_id: int, payload: dict[str, Any], settings: Settings) -> PushSendResult:
    if not settings.telegram_bot_token:
        return PushSendResult(outcome=PushOutcome.FATAL, error="telegram_not_configured")
    data = json.dumps(
        {"chat_id": chat_id, **build_message(payload, settings.frontend_base_url)}
    ).encode()
    call = request.Request(
        f"{API_BASE}/bot{settings.telegram_bot_token}/sendMessage",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(call, timeout=settings.telegram_timeout_seconds) as response:
            return PushSendResult(outcome=PushOutcome.SUCCESS, status_code=response.status)
    except error.HTTPError as exc:
        description = ""
        with contextlib.suppress(ValueError, OSError):
            description = str(json.loads(exc.read().decode()).get("description", ""))
        # Токен и чат в логи не пишем.
        logger.warning("telegram send failed status=%s", exc.code)
        return classify(exc.code, description)
    except (error.URLError, TimeoutError, OSError):
        return PushSendResult(outcome=PushOutcome.RETRYABLE, error="network_error")
