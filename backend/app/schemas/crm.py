from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import ChipRequestKind, ChipRequestStatus, PlayerKind, ThreadStatus
from app.schemas.chips import PlayerAdminRead


class RequestBrief(BaseModel):
    id: UUID
    kind: ChipRequestKind
    status: ChipRequestStatus
    summary: str
    created_at: datetime


class ThreadBrief(BaseModel):
    id: UUID
    subject: str
    status: ThreadStatus
    last_message_at: datetime


class PlayerCrmCard(PlayerAdminRead):
    """Карточка человека (ТЗ §9а.3): всё из списка плюс история и связи."""

    referrer_nickname: str | None = None
    invited_players: int = 0
    completed_topups: int = 0
    requests: list[RequestBrief] = Field(default_factory=list)
    threads: list[ThreadBrief] = Field(default_factory=list)


class BirthdayItem(BaseModel):
    player_id: UUID
    nickname: str
    real_name: str | None
    birthday: date
    days: int


class CrmSummary(BaseModel):
    """Виджеты главной админки: дни рождения, спящие, активность (ТЗ §9а.3)."""

    birthdays: list[BirthdayItem]
    sleeping: int
    active_7d: int
    new_7d: int
    total_active: int


SegmentKind = Literal["all", "sleeping", "tag", "player_kind", "players"]


class BroadcastSegment(BaseModel):
    """Кому рассылка: вся активная база, спящие, тег, тип игрока или выбранные (ТЗ §4.2б)."""

    kind: SegmentKind = "all"
    tag: str | None = Field(default=None, max_length=32)
    player_kind: PlayerKind | None = None
    player_ids: list[UUID] = Field(default_factory=list, max_length=500)


class BroadcastCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=300)
    url: str = Field(default="/", max_length=200)
    segment: BroadcastSegment

    @field_validator("title", "body")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Не может быть пустым")
        return cleaned

    @field_validator("url")
    @classmethod
    def _relative(cls, value: str) -> str:
        cleaned = value.strip() or "/"
        # Пуш открывает только адрес внутри приложения — так же проверяет воркер.
        if not cleaned.startswith("/") or cleaned.startswith("//"):
            raise ValueError("Ссылка должна вести внутрь приложения: /tournaments, /chips…")
        return cleaned


class BroadcastPreview(BaseModel):
    recipients: int
    with_push: int


class BroadcastRead(BaseModel):
    id: UUID
    title: str
    body: str
    url: str
    segment: BroadcastSegment
    recipients: int
    pushes: int
    author_nickname: str | None
    created_at: datetime
