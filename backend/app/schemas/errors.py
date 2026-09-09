from typing import Any

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    retry_after: int | None = None
    attempts_left: int | None = None
    active_session_id: str | None = None
    result_id: str | None = None
    server: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
