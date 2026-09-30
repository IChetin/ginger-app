from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.feed import WinClub

PromoKind = Literal["leaderboard", "freeroll", "bonus", "other"]
PromoGame = Literal["mtt", "cash", "any"]
PromoRecurrence = Literal["none", "monthly"]

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class PromoPrize(BaseModel):
    """Приз за место: деньги (`amount`) или вещь/билет (`label`)."""

    place: int = Field(ge=1, le=100)
    amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    label: str | None = Field(default=None, max_length=60)


class PromoWindow(BaseModel):
    """Ежедневное окно с множителем очков по Москве: «x2 с 10:00 до 12:00»."""

    start: str
    end: str
    multiplier: int = Field(default=2, ge=2, le=10)

    @field_validator("start", "end")
    @classmethod
    def _hhmm(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) == 4:
            cleaned = f"0{cleaned}"
        if not _HHMM.match(cleaned):
            raise ValueError("Время в виде ЧЧ:ММ")
        return cleaned


class PromotionRead(BaseModel):
    id: UUID
    club: WinClub | None
    kind: PromoKind
    title: str
    prize_fund: Decimal | None
    prize_extra: str | None
    currency_code: str | None
    currency_symbol: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    recurrence: PromoRecurrence
    game: PromoGame
    buyin_min: Decimal | None
    buyin_max: Decimal | None
    prizes: list[PromoPrize]
    boost_windows: list[PromoWindow]
    image_url: str | None


class PromotionAdminRead(PromotionRead):
    is_published: bool
    source_text: str | None
    uncertain: list[str]
    renewed_from_id: UUID | None
    created_at: datetime


class PromotionWrite(BaseModel):
    club_id: UUID | None = None
    kind: PromoKind = "leaderboard"
    title: str = Field(min_length=1, max_length=120)
    prize_fund: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    prize_extra: str | None = Field(default=None, max_length=80)
    currency_code: str | None = Field(default=None, max_length=8)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    recurrence: PromoRecurrence = "none"
    game: PromoGame = "mtt"
    buyin_min: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    buyin_max: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    prizes: list[PromoPrize] = Field(default_factory=list, max_length=100)
    boost_windows: list[PromoWindow] = Field(default_factory=list, max_length=6)
    # Поля, которые менеджер ещё не проверил, — подсветка остаётся, пока их не поправят.
    uncertain: list[str] = Field(default_factory=list, max_length=20)
    is_published: bool = False

    @field_validator("title", "prize_extra", "currency_code")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        cleaned = (value or "").strip()
        return cleaned or None

    @field_validator("title")
    @classmethod
    def _title_required(cls, value: str | None) -> str:
        if not value:
            raise ValueError("Не может быть пустым")
        return value

    @field_validator("currency_code")
    @classmethod
    def _upper(cls, value: str | None) -> str | None:
        return value.upper() if value else None

    @model_validator(mode="after")
    def _publishable(self) -> PromotionWrite:
        low, high = self.buyin_min, self.buyin_max
        if low is not None and high is not None and high < low:
            raise ValueError("Бай-ин «до» меньше, чем «от»")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("Окончание раньше начала")
        places = [prize.place for prize in self.prizes]
        if len(places) != len(set(places)):
            raise ValueError("Место в призах повторяется")
        if self.is_published:
            missing = [
                label
                for label, value in (
                    ("клуб", self.club_id),
                    ("начало", self.starts_at),
                    ("окончание", self.ends_at),
                )
                if value is None
            ]
            if missing:
                raise ValueError("Для публикации не хватает: " + ", ".join(missing))
        return self


class PromotionFromText(BaseModel):
    text: str = Field(min_length=10, max_length=8000)
