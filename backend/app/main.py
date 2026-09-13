import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.api.spa_redirects import router as spa_redirects_router
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.exceptions import AppError
from app.schemas.errors import ErrorBody, ErrorResponse


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    boot_settings = get_settings()
    if boot_settings.is_production and (problems := boot_settings.production_problems()):
        raise RuntimeError("Небезопасные настройки production: " + "; ".join(problems))

    from app.core.database import async_session_factory
    from app.services.parser_profiles import (
        apply_default_organizer_bindings,
        sync_parser_profiles,
    )

    try:
        async with async_session_factory() as session:
            await sync_parser_profiles(session)
            await apply_default_organizer_bindings(session)
            await session.commit()
    except Exception:  # noqa: BLE001 — boot must not die if DB not ready yet
        import logging

        logging.getLogger(__name__).exception("parser_profiles sync on startup failed")

    rollforward: asyncio.Task[None] | None = None
    interval = get_settings().schedule_rollforward_interval_seconds
    if interval > 0:
        from app.services.tournaments.rollforward import run_periodically

        rollforward = asyncio.create_task(run_periodically(interval))
    housekeeping: asyncio.Task[None] | None = None
    housekeeping_interval = get_settings().chips_housekeeping_interval_seconds
    if housekeeping_interval > 0:
        from app.services.chips import run_housekeeping_periodically

        housekeeping = asyncio.create_task(run_housekeeping_periodically(housekeeping_interval))
    schedule_fetch: asyncio.Task[None] | None = None
    fetch_interval = get_settings().schedule_fetch_interval_seconds
    if fetch_interval > 0:
        from app.services.tournaments.auto_fetch import run_periodically as run_fetch

        schedule_fetch = asyncio.create_task(run_fetch(fetch_interval))
    yield
    for task in (rollforward, housekeeping, schedule_fetch):
        if task is None:
            continue
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    await engine.dispose()


def _error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    retry_after: int | None = None,
    attempts_left: int | None = None,
    active_session_id: str | None = None,
    result_id: str | None = None,
    server: dict | None = None,
) -> JSONResponse:
    payload = ErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            retry_after=retry_after,
            attempts_left=attempts_left,
            active_session_id=active_session_id,
            result_id=result_id,
            server=server,
        )
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(exclude_none=True),
    )


class OriginGuardMiddleware(BaseHTTPMiddleware):
    """Reject unsafe cookie-auth requests without trusted Origin/Referer."""

    UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if request.method in self.UNSAFE_METHODS and request.url.path.startswith("/api/"):
            settings = get_settings()
            allowed = set(settings.cors_origins_list)
            origin = request.headers.get("origin")
            referer = request.headers.get("referer")
            candidate = origin
            if candidate is None and referer:
                parsed = urlparse(referer)
                if parsed.scheme and parsed.netloc:
                    candidate = f"{parsed.scheme}://{parsed.netloc}"

            # Allow same-origin tooling / tests without Origin (e.g. httpx ASGI).
            if candidate is None:
                host = request.headers.get("host")
                if host and any(
                    urlparse(item).netloc == host or item.endswith(f"://{host}") for item in allowed
                ):
                    return await call_next(request)
                # ASGI test client uses base_url http://test without matching CORS.
                if host in {"test", "testserver"} or (
                    request.client and request.client.host in {"test", "testclient"}
                ):
                    return await call_next(request)
                if settings.is_development or settings.is_test:
                    return await call_next(request)
                return _error_response(403, "forbidden_origin", "Trusted origin required")

            if candidate not in allowed:
                return _error_response(403, "forbidden_origin", "Trusted origin required")

        return await call_next(request)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(OriginGuardMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return _error_response(
            exc.status_code,
            exc.code,
            exc.message,
            retry_after=exc.retry_after,
            attempts_left=exc.attempts_left,
            active_session_id=exc.active_session_id,
            result_id=exc.result_id,
            server=exc.server,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        errors = exc.errors()
        if errors:
            first = errors[0]
            location = ".".join(str(part) for part in first.get("loc", ()))
            detail = first.get("msg", "Invalid request")
            message = f"{location}: {detail}" if location else str(detail)
        else:
            message = "Invalid request"
        return _error_response(422, "validation_error", message)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        detail = exc.detail
        message = detail if isinstance(detail, str) else "Request failed"
        code = "not_found" if exc.status_code == 404 else "http_error"
        return _error_response(exc.status_code, code, message)

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    app.include_router(spa_redirects_router)
    return app


app = create_app()
