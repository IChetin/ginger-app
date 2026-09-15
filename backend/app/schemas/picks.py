from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.cash import CashTableRead
from app.schemas.tournaments import TournamentRead

PickKind = Literal["mtt", "cash"]


class EditorPickCreate(BaseModel):
    kind: PickKind
    club_id: UUID
    match: str = Field(min_length=2, max_length=160)
    note: str | None = Field(default=None, max_length=200)
    sort_order: int = 0


class EditorPickUpdate(BaseModel):
    match: str | None = Field(default=None, min_length=2, max_length=160)
    note: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None
    sort_order: int | None = None


class EditorPickAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: PickKind
    club_id: UUID
    club_name: str
    match: str
    note: str | None
    is_active: bool
    sort_order: int
    created_at: datetime
    # Сколько сейчас подходит: ближайших стартов за неделю или открытых столов. 0 — пик
    # игроку не виден, фрагмент стоит проверить.
    matched_now: int = 0


class EditorPickRead(BaseModel):
    """Пик глазами игрока: у MTT — ближайший старт, у CASH — открытые сейчас столы."""

    id: UUID
    kind: PickKind
    note: str | None
    tournament: TournamentRead | None = None
    tables: list[CashTableRead] = Field(default_factory=list)
