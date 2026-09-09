"""HTTP 301 redirects for legacy UUID / old-slug public URLs + SPA shell passthrough."""

from __future__ import annotations

from html import escape
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_optional_user
from app.core.exceptions import NotFoundError
from app.models.auth import User
from app.schemas.hands import parse_stored_hand
from app.services import hands as hands_service
from app.services import slugs as slugs_service
from app.services.paths import event_canonical_path, series_canonical_path
from app.services.pdf.hand_og import og_image_url, public_og_meta

router = APIRouter(tags=["spa-redirects"])

# Показывается, пока frontend пересобирается (npm ci/build). Без meta-refresh
# hard refresh на /series|/events даёт «белый экран» (пустой #root без JS).
_SPA_STUB = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><title>Day2</title>
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


def _inject_og(html: str, *, title: str, description: str, image: str) -> str:
    safe_title = escape(title, quote=True)
    safe_desc = escape(description, quote=True)
    safe_image = escape(image, quote=True)
    tags = (
        f'<meta property="og:title" content="{safe_title}"/>'
        f'<meta property="og:description" content="{safe_desc}"/>'
        f'<meta property="og:image" content="{safe_image}"/>'
        f'<meta property="og:image:alt" content="{safe_title}"/>'
        '<meta property="og:image:width" content="1200"/>'
        '<meta property="og:image:height" content="630"/>'
        '<meta property="og:type" content="website"/>'
        '<meta name="twitter:card" content="summary_large_image"/>'
        f'<meta name="twitter:title" content="{safe_title}"/>'
        f'<meta name="twitter:description" content="{safe_desc}"/>'
        f'<meta name="twitter:image" content="{safe_image}"/>'
    )
    if "</head>" in html:
        html = html.replace("</head>", f"{tags}</head>", 1)
    if "<title>Day2</title>" in html:
        html = html.replace("<title>Day2</title>", f"<title>{safe_title}</title>", 1)
    return html


@router.get("/hand/new")
@router.head("/hand/new")
async def hand_new_page() -> Response:
    return await _serve_spa()


@router.get("/hand/draft/{hand_id}")
@router.head("/hand/draft/{hand_id}")
async def hand_draft_page(
    hand_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
) -> Response:
    try:
        row = await hands_service.get_hand(db, hand_id, viewer, increment_views=False)
    except NotFoundError:
        return Response(status_code=404)
    if not row.slug:
        return Response(status_code=404)
    return RedirectResponse(f"/hand/{row.slug}", status_code=301)


@router.get("/hand/{slug}/edit")
@router.head("/hand/{slug}/edit")
async def hand_edit_page() -> Response:
    return await _serve_spa()


@router.get("/hand/{slug}")
@router.head("/hand/{slug}")
async def hand_page(
    slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
) -> Response:
    try:
        row = await hands_service.get_hand(db, slug, viewer, increment_views=False)
    except NotFoundError:
        if viewer is not None:
            return await _serve_spa()
        return Response(status_code=404)
    if row.status.value == "draft":
        return await _serve_spa()
    html_response = await _serve_spa()
    if not isinstance(html_response, HTMLResponse):
        return html_response
    data = parse_stored_hand(row.data)
    settings = get_settings()
    origin = settings.frontend_base_url.rstrip("/")
    event_label: str | None = None
    if row.event is not None:
        event_label = row.event.name
        if row.event.series is not None:
            event_label = f"{row.event.name} · {row.event.series.name}"
    title, description = public_og_meta(
        data=data,
        nickname=row.user.nickname,
        event_label=event_label,
        note=row.note,
    )
    image = og_image_url(origin=origin, slug=row.slug, updated_at=row.updated_at)
    return HTMLResponse(
        content=_inject_og(
            bytes(html_response.body).decode("utf-8"),
            title=title,
            description=description,
            image=image,
        ),
        status_code=200,
        headers=_NO_STORE,
    )


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
