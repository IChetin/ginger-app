"""HTTP 301 redirects for legacy UUID / old-slug public URLs + SPA shell passthrough."""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.services import slugs as slugs_service
from app.services.paths import event_canonical_path, series_canonical_path

router = APIRouter(tags=["spa-redirects"])

# Показывается, пока frontend пересобирается (npm ci/build). Без meta-refresh
# hard refresh на /series|/events даёт «белый экран» (пустой #root без JS).
_SPA_STUB = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><title>Ginger</title>
<meta http-equiv="refresh" content="2">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;
background:#0B0A09;color:#A9A395;font:15px/1.4 system-ui,sans-serif}
</style></head>
<body><p>Загрузка…</p></body></html>
"""

_NO_STORE = {"Cache-Control": "no-store, must-revalidate", "Pragma": "no-cache"}


def _with_query(path: str, request: Request) -> str:
    query = request.url.query
    if query:
        return f"{path}?{query}"
    return path


async def _serve_spa() -> Response:
    settings = get_settings()
    base = settings.spa_internal_url.strip()
    if not base:
        return HTMLResponse(_SPA_STUB, headers=_NO_STORE)
    url = base.rstrip("/") + "/"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            upstream = await client.get(url)
        if upstream.status_code >= 400:
            return HTMLResponse(_SPA_STUB, headers=_NO_STORE)
        return HTMLResponse(content=upstream.text, status_code=200, headers=_NO_STORE)
    except httpx.HTTPError:
        return HTMLResponse(_SPA_STUB, headers=_NO_STORE)


@router.get("/series/{key}")
@router.head("/series/{key}")
async def series_page(
    key: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    try:
        series = await slugs_service.resolve_series(db, key)
    except NotFoundError:
        return Response(status_code=404)
    canonical = series_canonical_path(series)
    if key != series.slug:
        return RedirectResponse(_with_query(canonical, request), status_code=301)
    return await _serve_spa()


@router.get("/series/{key}/schedule")
@router.head("/series/{key}/schedule")
async def series_schedule_page(
    key: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    try:
        series = await slugs_service.resolve_series(db, key)
    except NotFoundError:
        return Response(status_code=404)
    canonical = f"{series_canonical_path(series)}/schedule"
    if key != series.slug:
        return RedirectResponse(_with_query(canonical, request), status_code=301)
    return await _serve_spa()


@router.get("/events/{key}")
@router.head("/events/{key}")
async def event_page(
    key: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    try:
        event = await slugs_service.resolve_event(db, key)
    except NotFoundError:
        return Response(status_code=404)
    canonical = event_canonical_path(event)
    public_key = canonical.removeprefix("/events/")
    if key != public_key:
        return RedirectResponse(_with_query(canonical, request), status_code=301)
    return await _serve_spa()
