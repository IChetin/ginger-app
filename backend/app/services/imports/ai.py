from __future__ import annotations

from typing import Protocol

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.imports import ParseResult
from app.services.imports.base import ParserContext


class AiParseProvider(Protocol):
    name: str

    def parse(
        self,
        ctx: ParserContext,
        data: bytes,
        *,
        unparsed_rows: list[str] | None = None,
    ) -> ParseResult: ...


class UnconfiguredAiProvider:
    name = "unconfigured"

    def parse(
        self,
        ctx: ParserContext,
        data: bytes,
        *,
        unparsed_rows: list[str] | None = None,
    ) -> ParseResult:
        del ctx, data, unparsed_rows
        raise AppError(
            "ai_unavailable",
            "AI import fallback is not configured",
            503,
        )


class MockAiProvider:
    """Test/dev double. Returns a preloaded ParseResult if set; else unavailable."""

    name = "mock"

    def __init__(self) -> None:
        self._result: ParseResult | None = None

    def set_result(self, result: ParseResult | None) -> None:
        self._result = result

    def parse(
        self,
        ctx: ParserContext,
        data: bytes,
        *,
        unparsed_rows: list[str] | None = None,
    ) -> ParseResult:
        del ctx, data, unparsed_rows
        if self._result is None:
            raise AppError(
                "ai_unavailable",
                "Mock AI has no ParseResult configured",
                503,
            )
        return self._result.model_copy(deep=True)


_mock_provider = MockAiProvider()


def get_mock_ai_provider() -> MockAiProvider:
    return _mock_provider


def get_ai_provider(settings: Settings | None = None) -> AiParseProvider:
    cfg = settings or get_settings()
    if cfg.import_ai_provider == "mock" and (cfg.is_development or cfg.is_test):
        return _mock_provider
    return UnconfiguredAiProvider()
