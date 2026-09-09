from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.hand_slug import is_valid_hand_slug

StreetName = Literal["preflop", "flop", "turn", "river"]
HandActionType = Literal["fold", "check", "call", "bet", "raise", "allin"]
PositionName = Literal["BTN", "SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO"]
HandStatusName = Literal["draft", "published"]
HandListStatusFilter = Literal["all", "draft", "published"]

CARD_RE = re.compile(r"^[2-9TJQKA][shdc]$")


class HandBlinds(BaseModel):
    sb: int = Field(ge=1)
    bb: int = Field(ge=1)
    ante: int = Field(default=0, ge=0)
    # bb — одно анте с BB; occupied — с каждого сидящего. Нет поля — легаси table_size × ante.
    ante_mode: Literal["bb", "occupied"] | None = None

    @model_validator(mode="after")
    def _bb_covers_sb(self) -> Self:
        if self.bb < self.sb:
            raise ValueError("BB не может быть меньше SB")
        return self


class HandSeat(BaseModel):
    seat: int = Field(ge=1, le=9)
    position: PositionName
    name: str = Field(min_length=1, max_length=16)
    stack: int
    is_hero: bool = False
    cards: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise ValueError("Имя игрока не может быть пустым")
        if len(name) > 16:
            raise ValueError("Имя игрока — до 16 символов")
        return name

    @field_validator("stack")
    @classmethod
    def _stack_positive(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Стек должен быть больше нуля")
        return value

    @field_validator("cards")
    @classmethod
    def _cards(cls, value: list[str]) -> list[str]:
        for card in value:
            if not CARD_RE.fullmatch(card):
                raise ValueError(f"Некорректная карта {card}")
        if value and len(value) != 2:
            raise ValueError("Карты — две или ни одной")
        return value


class HandAction(BaseModel):
    seat: int = Field(ge=1, le=9)
    action: HandActionType
    amount: int | None = Field(default=None, ge=1)


class HandStreet(BaseModel):
    street: StreetName
    board: list[str] = Field(default_factory=list)
    actions: list[HandAction] = Field(default_factory=list)

    @field_validator("board")
    @classmethod
    def _board(cls, value: list[str]) -> list[str]:
        for card in value:
            if not CARD_RE.fullmatch(card):
                raise ValueError(f"Некорректная карта {card}")
        return value


class HandResult(BaseModel):
    winner_seats: list[int] = Field(min_length=1)
    pot: int = Field(ge=0)
    hero_invested: int = Field(ge=0)
    hero_profit: int
    side_pots: None = None


class HandDocument(BaseModel):
    """Stored hand JSON. Engine invariants are checked on write (`HandData`), not on read."""

    schema_version: Literal[1] = 1
    table_size: Literal[2, 3, 4, 5, 6, 7, 8, 9]
    blinds: HandBlinds
    hero_seat: int = Field(ge=1, le=9)
    button_seat: int = Field(ge=1, le=9)
    seats: list[HandSeat] = Field(min_length=2, max_length=9)
    streets: list[HandStreet] = Field(max_length=4)
    result: HandResult


class HandData(HandDocument):
    @model_validator(mode="after")
    def _engine(self) -> Self:
        seats: list[HandSeat] = []
        for seat in self.seats:
            if seat.is_hero or seat.seat == self.hero_seat:
                seats.append(seat.model_copy(update={"name": "Вы"}))
            else:
                seats.append(seat)
        data = self.model_copy(update={"seats": seats}) if seats != list(self.seats) else self
        from app.services.hand_engine import validate_hand_data

        validate_hand_data(data)
        return data


def parse_stored_hand(raw: object) -> HandDocument:
    """Parse a document from the database without write-time engine checks."""
    return HandDocument.model_validate(raw)


class HandCreate(BaseModel):
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    is_public: bool = True
    title: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    data: HandData


class HandUpdate(BaseModel):
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    is_public: bool | None = None
    title: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    data: HandData | None = None
    clear_event: bool = False
    clear_series: bool = False
    clear_live_session: bool = False


class HandPreview(BaseModel):
    hero_cards: list[str]
    board: list[str]
    hero_profit: int
    pot: int


class HandEventBrief(BaseModel):
    id: UUID
    name: str
    series_name: str


class HandSeriesBrief(BaseModel):
    id: UUID
    name: str


class HandAuthor(BaseModel):
    nickname: str


class HandListItem(BaseModel):
    id: UUID
    slug: str
    status: HandStatusName
    current_step: int | None
    current_street: StreetName | None
    title: str | None
    note: str | None
    is_public: bool
    views_count: int
    created_at: datetime
    updated_at: datetime
    preview: HandPreview
    event: HandEventBrief | None
    series: HandSeriesBrief | None = None


class HandRead(BaseModel):
    id: UUID
    slug: str
    status: HandStatusName
    current_step: int | None
    current_street: StreetName | None
    title: str | None
    note: str | None
    is_public: bool
    views_count: int
    created_at: datetime
    updated_at: datetime
    event_id: UUID | None
    series_id: UUID | None
    live_session_id: UUID | None
    event: HandEventBrief | None
    series: HandSeriesBrief | None
    author: HandAuthor
    is_owner: bool
    data: HandDocument | None = None
    wizard: dict[str, Any] | None = None


class HandDraftCreate(BaseModel):
    id: UUID
    current_step: int = Field(default=1, ge=1, le=4)
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    title: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    wizard: dict[str, Any] | None = None
    slug: str | None = Field(default=None, min_length=10, max_length=10)

    @field_validator("slug")
    @classmethod
    def _hand_slug_alphabet(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not is_valid_hand_slug(value):
            raise ValueError("Некорректная ссылка")
        return value


class HandDraftUpdate(BaseModel):
    current_step: int | None = Field(default=None, ge=1, le=4)
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    title: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    wizard: dict[str, Any] | None = None
    clear_event: bool = False
    clear_series: bool = False
    clear_live_session: bool = False
    base_updated_at: datetime | None = None


class HandPatch(BaseModel):
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    is_public: bool | None = None
    title: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    data: HandData | None = None
    wizard: dict[str, Any] | None = None
    current_step: int | None = Field(default=None, ge=1, le=4)
    clear_event: bool = False
    clear_series: bool = False
    clear_live_session: bool = False
    base_updated_at: datetime | None = None


class HandPublish(BaseModel):
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    is_public: bool = True
    title: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    data: HandData
    clear_event: bool = False
    clear_series: bool = False
    clear_live_session: bool = False


class HandLinkTarget(BaseModel):
    kind: Literal["live", "event", "series"]
    section: Literal["live", "today", "running", "search"] = "today"
    event_id: UUID | None = None
    series_id: UUID | None = None
    live_session_id: UUID | None = None
    label: str
    series_name: str | None = None
