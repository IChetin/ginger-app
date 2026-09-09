"""Parse admin confirm headers (preview token companions)."""

from __future__ import annotations

from app.core.exceptions import AppError


def parse_notify_header(value: str | None) -> bool:
    """X-Notify: default True. Accept 1/0, true/false, yes/no, on/off."""
    if value is None or not value.strip():
        return True
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise AppError(
        "validation_error",
        "Invalid X-Notify header; use 1/0 or true/false",
        400,
    )
