from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import PokerApp
from app.schemas.tournaments import TournamentRead


class WinClub(BaseModel):
    id: UUID
    name: str
    app: PokerApp


class WinRead(BaseModel):
    id: UUID
    player_nickname: str
    club: WinClub | None
    tournament_name: str
    place: int | None
    prize_amount: Decimal
    currency_code: str
    currency_symbol: str | None
    won_on: date


class WinCreate(BaseModel):
    player_nickname: str = Field(min_length=1, max_length=64)
    player_id: UUID | None = None
    club_id: UUID | None = None
    tournament_name: str = Field(min_length=1, max_length=160)
    place: int | None = Field(default=None, ge=1, le=10_000)
    prize_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency_code: str = Field(min_length=3, max_length=8)
    won_on: date | None = None

    @field_validator("player_nickname", "tournament_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Не может быть пустым")
        return cleaned

    @field_validator("currency_code")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()


class FeedRead(BaseModel):
    """Лента (этап 7): главное событие каждого дня, вечер в каждом клубе, выигрыши."""

    main_events: list[TournamentRead]
    evening: list[TournamentRead]
    wins: list[WinRead]
