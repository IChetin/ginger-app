from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import GameType

PickKind = Literal["mtt", "cash"]


class EditorPickCreate(BaseModel):
    """MTT — клуб и часть названия турнира; CASH — клуб, игра и (необязательно) большой блайнд."""

    kind: PickKind
    club_id: UUID
    match: str | None = Field(default=None, min_length=2, max_length=160)
    game_type: GameType | None = None
    big_blind: Decimal | None = Field(default=None, gt=0)
    note: str | None = Field(default=None, max_length=200)
    sort_order: int = 0

    @model_validator(mode="after")
    def _target(self) -> EditorPickCreate:
        if self.kind == "mtt":
            if not (self.match or "").strip():
                raise ValueError("Для MTT нужна часть названия турнира")
            self.game_type = None
            self.big_blind = None
        else:
            if self.game_type is None:
                raise ValueError("Для CASH нужна игра")
            self.match = None
        return self


class EditorPickUpdate(BaseModel):
    note: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None
    sort_order: int | None = None


class EditorPickAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: PickKind
    club_id: UUID
    club_name: str
    match: str | None
    game_type: GameType | None
    big_blind: Decimal | None
    note: str | None
    is_active: bool
    sort_order: int
    created_at: datetime
    # Сколько подходит сейчас: у MTT — стартов за неделю, у CASH — открытых столов.
    # 0 — в фильтре пусто, условие стоит проверить.
    matched_now: int = 0
