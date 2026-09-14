"""Докручивание расписания: старты из шаблонов всегда развёрнуты на горизонт вперёд.

Импорт сетки разворачивает её сразу, но горизонт отсчитывается от момента импорта — без
докручивания через две недели расписание кончилось бы. Задача живёт в бэкенде, а не в воркере:
воркер — отдельная кодовая база со своими моделями, логику пришлось бы дублировать.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.tournaments import TournamentTemplate
from app.services.tournaments.reminders import reschedule_pending
from app.services.tournaments.schedule_sync import ExpansionSummary, expand_templates

logger = logging.getLogger(__name__)

# Произвольный, но постоянный ключ advisory-lock: несколько процессов бэкенда не должны
# докручивать одновременно.
_LOCK_KEY = 0x47494E47  # «GING»


async def expand_all_clubs(
    session: AsyncSession, *, now: datetime | None = None
) -> ExpansionSummary | None:
    """Развернуть шаблоны всех клубов. None — докручивает другой процесс."""
    locked = await session.scalar(
        text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": _LOCK_KEY}
    )
    if not locked:
        return None
    club_ids = list(
        await session.scalars(
            select(TournamentTemplate.club_id)
            .where(TournamentTemplate.is_active.is_(True))
            .distinct()
        )
    )
    if not club_ids:
        return ExpansionSummary()
    summary = await expand_templates(
        session, club_ids, now=now, horizon_days=get_settings().schedule_horizon_days
    )
    await reschedule_pending(session)
    return summary


async def run_periodically(interval_seconds: int) -> None:
    from app.core.database import async_session_factory

    while True:
        try:
            async with async_session_factory() as session:
                summary = await expand_all_clubs(session)
                await session.commit()
            if summary is not None:
                logger.info(
                    "schedule roll-forward: created=%s updated=%s deleted=%s",
                    summary.created,
                    summary.updated,
                    summary.deleted,
                )
        except Exception:  # noqa: BLE001 — упавший проход не должен убивать цикл
            logger.exception("schedule roll-forward failed")
        await asyncio.sleep(interval_seconds)
