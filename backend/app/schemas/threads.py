from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import PlayerKind, ThreadStatus, ThreadTopic

# История раздачи из клиента бывает длинной, но не бесконечной.
MESSAGE_MAX_LENGTH = 20_000


class ThreadMessageRead(BaseModel):
    id: UUID
    from_manager: bool
    author_nickname: str | None
    body: str | None
    attachment_id: UUID | None
    created_at: datetime


class ThreadSummary(BaseModel):
    id: UUID
    topic: ThreadTopic
    status: ThreadStatus
    subject: str
    chip_request_id: UUID | None
    last_message_at: datetime
    last_message_preview: str | None
    # Для игрока — есть ответ менеджера, который он не открывал; для менеджера — наоборот.
    unread: bool
    player_id: UUID
    player_nickname: str | None = None
    player_kind: PlayerKind | None = None


class ThreadRead(ThreadSummary):
    messages: list[ThreadMessageRead]
    # «12:00–03:00 — на связи, в другое время постараемся» (ТЗ §6.1).
    manager_hours: str


class ThreadCreate(BaseModel):
    topic: ThreadTopic = ThreadTopic.QUESTION
    subject: str | None = Field(default=None, max_length=120)
    body: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)
    chip_request_id: UUID | None = None

    @model_validator(mode="after")
    def chip_request_matches_topic(self) -> ThreadCreate:
        if (self.topic is ThreadTopic.CHIP_REQUEST) != (self.chip_request_id is not None):
            raise ValueError("Переписка по заявке ведётся только с указанием заявки")
        if not self.body.strip():
            raise ValueError("Сообщение пустое")
        return self


class ThreadMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)
