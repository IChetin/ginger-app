from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import GameType
from app.schemas.collector import validate_app_link
from app.schemas.tournaments import TournamentClub


class CollectedCashTable(BaseModel):
    """Стол из списка кэш-столов лобби. Суммы — в фишках клуба."""

    table_key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    game_type: GameType = GameType.NLH
    small_blind: Decimal = Field(ge=0)
    big_blind: Decimal = Field(gt=0)
    ante: Decimal | None = Field(default=None, ge=0)
    table_size: int | None = Field(default=None, ge=2, le=10)
    seated: int | None = Field(default=None, ge=0, le=10)
    waiting: int | None = Field(default=None, ge=0, le=99)
    min_buyin: Decimal | None = Field(default=None, ge=0)
    max_buyin: Decimal | None = Field(default=None, ge=0)
    app_link: str | None = Field(default=None, max_length=500)

    _link = field_validator("app_link")(validate_app_link)

    @model_validator(mode="after")
    def _blinds_order(self) -> CollectedCashTable:
        if self.small_blind > self.big_blind:
            raise ValueError("Малый блайнд больше большого")
        return self


class CashSnapshotIn(BaseModel):
    """Все кэш-столы клуба за один заход. Стола нет в списке — он закрылся."""

    club_slug: str = Field(min_length=1, max_length=64)
    tables: list[CollectedCashTable] = Field(default_factory=list, max_length=300)

    @model_validator(mode="after")
    def _unique_keys(self) -> CashSnapshotIn:
        keys = [table.table_key for table in self.tables]
        if len(keys) != len(set(keys)):
            raise ValueError("Ключи столов повторяются")
        return self


class CashSnapshotResult(BaseModel):
    added: int = 0
    updated: int = 0
    closed: int = 0


class CashTableRead(BaseModel):
    id: UUID
    club: TournamentClub
    name: str
    game_type: GameType
    small_blind: Decimal
    big_blind: Decimal
    ante: Decimal | None
    table_size: int | None
    seated: int | None
    waiting: int | None
    min_buyin: Decimal | None
    max_buyin: Decimal | None
    app_link: str | None
    seen_at: datetime
    # Большой блайнд в рублях по курсу клуба — для фильтра ставок; None без курса.
    big_blind_rub: Decimal | None
