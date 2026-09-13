"""Автозагрузка сетки клуба раз в день по ссылке на опубликованный лист (ответ 11.31).

Лист союза меняют люди, и в момент загрузки он может быть наполовину стёрт или закрыт доступом
(Google тогда отдаёт HTML-страницу входа). Поэтому автозагрузка осторожнее ручной:

- не CSV — ошибка, сетка не трогается;
- импорт сначала прогоняется предпросмотром, и если он убирает больше половины сетки
  источника — не применяем, пишем ошибку. Такое правят руками через «Сетки клубов».

Ошибка сохраняется в клубе и видна в админке; успешная загрузка её очищает.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.models.clubs import Club
from app.models.tournaments import TournamentTemplate
from app.schemas.tournaments import TemplatesImportResult
from app.services.tournaments.imports import import_club_templates

logger = logging.getLogger(__name__)

Fetcher = Callable[[str], Awaitable[bytes]]

_LOCK_KEY = 0x47524944  # «GRID»
# Меньше этого сетку не сторожим: у маленькой сетки «половина» — пара турниров.
_GUARD_MIN_TEMPLATES = 10


class FetchError(Exception):
    pass


async def download_csv(url: str) -> bytes:
    settings = get_settings()
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        response = await client.get(url)
    if response.status_code != 200:
        raise FetchError(f"Лист не отдаётся: HTTP {response.status_code}")
    content_type = response.headers.get("content-type", "")
    if "html" in content_type:
        raise FetchError("Вместо таблицы пришла веб-страница — лист закрыт или не опубликован")
    if len(response.content) > settings.import_max_file_bytes:
        raise FetchError("Лист слишком большой")
    return response.content


async def _source_templates_count(session: AsyncSession, club_id: object) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(TournamentTemplate)
        .where(TournamentTemplate.club_id == club_id, TournamentTemplate.source.is_not(None))
    )
    return int(count or 0)


async def fetch_club_schedule(
    session: AsyncSession,
    club: Club,
    *,
    fetcher: Fetcher | None = None,
    now: datetime | None = None,
) -> TemplatesImportResult:
    """Скачать лист клуба и применить. Неудача записывается в клуб и поднимается как AppError."""
    moment = now or datetime.now(UTC)
    if not club.schedule_source_url:
        raise AppError("no_schedule_source", "У клуба не задана ссылка на лист", 422)
    try:
        data = await (fetcher or download_csv)(club.schedule_source_url)
        preview = await import_club_templates(session, club.id, data, dry_run=True, now=moment)
        existing = await _source_templates_count(session, club.id)
        if existing >= _GUARD_MIN_TEMPLATES and preview.templates_removed * 2 > existing:
            raise FetchError(
                f"Лист убирает {preview.templates_removed} из {existing} турниров сетки — "
                "похоже, его сейчас правят. Не применено"
            )
        result = await import_club_templates(session, club.id, data, dry_run=False, now=moment)
    except (FetchError, AppError, httpx.HTTPError) as error:
        message = error.message if isinstance(error, AppError) else str(error) or repr(error)
        club.schedule_fetch_error = message[:500]
        await session.flush()
        raise AppError("schedule_fetch_failed", message, 422) from error
    club.schedule_fetched_at = moment
    club.schedule_fetch_error = None
    await session.flush()
    return result


async def fetch_all_clubs(session_factory: Callable[[], AsyncSession]) -> None:
    async with session_factory() as session:
        locked = await session.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": _LOCK_KEY})
        if not locked:
            return
        try:
            club_ids = list(
                await session.scalars(select(Club.id).where(Club.schedule_source_url.is_not(None)))
            )
            for club_id in club_ids:
                club = await session.get(Club, club_id)
                if club is None:
                    continue
                try:
                    result = await fetch_club_schedule(session, club)
                    logger.info(
                        "schedule fetch %s: +%s -%s templates",
                        club.slug,
                        result.templates_created,
                        result.templates_removed,
                    )
                except AppError as error:
                    logger.warning("schedule fetch %s failed: %s", club.slug, error.message)
                # Коммит на каждый клуб: ошибка одного не откатывает остальные.
                await session.commit()
        finally:
            await session.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _LOCK_KEY})
            await session.commit()


async def run_periodically(interval_seconds: int) -> None:
    from app.core.database import async_session_factory

    # Не на старте: перезапуск бэкенда не должен каждый раз дёргать листы союзов.
    await asyncio.sleep(min(interval_seconds, 300))
    while True:
        try:
            await fetch_all_clubs(async_session_factory)
        except Exception:  # noqa: BLE001 — упавший проход не должен убивать цикл
            logger.exception("schedule fetch failed")
        await asyncio.sleep(interval_seconds)
