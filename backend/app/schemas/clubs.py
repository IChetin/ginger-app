from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ClubBlock, PokerApp


class ClubBrief(BaseModel):
    """Клуб глазами игрока — без рейкбека, менеджера и заметок."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    app: PokerApp
    app_club_id: str | None
    chip_value: Decimal | None
    chip_currency_code: str | None
    games: str | None
    limits: str | None
    peak_hours: str | None
    active_players: str | None
    download_url: str | None
    join_steps: str | None
    is_promoted: bool


class ClubAdminRead(ClubBrief):
    organizer_id: UUID | None
    organizer_name: str | None = None
    block: ClubBlock
    rakeback_note: str | None
    manager_note: str | None
    notes: str | None
    is_visible: bool
    sort_order: int
    templates_count: int = 0


class ClubAdminUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    app: PokerApp | None = None
    app_club_id: str | None = Field(default=None, max_length=32)
    organizer_id: UUID | None = None
    block: ClubBlock | None = None
    chip_value: Decimal | None = Field(default=None, gt=0)
    chip_currency_code: str | None = Field(default=None, min_length=3, max_length=8)
    games: str | None = Field(default=None, max_length=64)
    limits: str | None = Field(default=None, max_length=64)
    peak_hours: str | None = Field(default=None, max_length=32)
    active_players: str | None = Field(default=None, max_length=32)
    download_url: str | None = None
    join_steps: str | None = None
    rakeback_note: str | None = None
    manager_note: str | None = Field(default=None, max_length=128)
    notes: str | None = None
    is_visible: bool | None = None
    is_promoted: bool | None = None
    sort_order: int | None = None


class ManualRateUpdate(BaseModel):
    """Курс валюты к рублю, заданный вручную (USDT: ЦБ его не публикует)."""

    rate_rub: Decimal = Field(gt=0, max_digits=14, decimal_places=6)


class ManualRateRead(BaseModel):
    currency_code: str
    rate_rub: Decimal
    rate_date: date
