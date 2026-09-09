"""Public URL helpers for organizer logos stored in Postgres."""

from __future__ import annotations

from app.core.config import get_settings
from app.models.references import Organizer


def organizer_logo_url(organizer: Organizer) -> str | None:
    """Prefer uploaded blob; fall back to external URL in links."""
    if organizer.logo_content_type:
        prefix = get_settings().api_v1_prefix.rstrip("/")
        return f"{prefix}/media/organizers/{organizer.id}/logo"
    links = organizer.links or {}
    return links.get("logo") or links.get("logo_url") or None
