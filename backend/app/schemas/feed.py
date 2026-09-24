from __future__ import annotations

from datetime import date, datetime
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


class FeedPostRead(BaseModel):
    """Запись менеджера в ленте: текст, картинка и ссылка внутрь приложения."""

    id: UUID
    title: str
    body: str | None
    image_url: str | None
    link_url: str | None
    link_label: str | None
    club: WinClub | None
    is_pinned: bool
    published_at: datetime
    expires_at: datetime | None


class FeedPostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str | None = Field(default=None, max_length=2000)
    link_url: str | None = Field(default=None, max_length=200)
    link_label: str | None = Field(default=None, max_length=40)
    club_id: UUID | None = None
    is_pinned: bool = False
    published_at: datetime | None = None
    expires_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Не может быть пустым")
        return cleaned

    @field_validator("body", "link_label")
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        cleaned = (value or "").strip()
        return cleaned or None

    @field_validator("link_url")
    @classmethod
    def _internal_link(cls, value: str | None) -> str | None:
        """Как в рассылках: ссылка открывает свой экран, а не уводит из приложения."""
        cleaned = (value or "").strip()
        if not cleaned:
            return None
        if not cleaned.startswith("/") or cleaned.startswith("//"):
            raise ValueError("Ссылка должна вести внутрь приложения: /tournaments, /clubs…")
        return cleaned


class FeedPostUpdate(FeedPostCreate):
    """Правка записи: поля те же, картинка меняется отдельной загрузкой."""


class FeedPostAdminRead(FeedPostRead):
    author_nickname: str | None
    created_at: datetime


class FeedRead(BaseModel):
    """Лента (этап 7): записи менеджера, главное событие дня, вечер в клубах, выигрыши."""

    posts: list[FeedPostRead]
    main_events: list[TournamentRead]
    evening: list[TournamentRead]
    wins: list[WinRead]
