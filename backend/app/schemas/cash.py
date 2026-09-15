from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import GameType
from app.schemas.collector import validate_app_link
from app.schemas.tournaments import TournamentClub


class CollectedCashGame(BaseModel):
    """Лимит из списка кэш-столов лобби: игра, блайнды и сколько столов. Суммы — в фишках."""

    game_type: GameType = GameType.NLH
    small_blind: Decimal = Field(ge=0)
    big_blind: Decimal = Field(gt=0)
    tables: int = Field(ge=1, le=500)
    app_link: str | None = Field(default=None, max_length=500)

    _link = field_validator("app_link")(validate_app_link)

    @model_validator(mode="after")
    def _blinds_order(self) -> CollectedCashGame:
        if self.small_blind > self.big_blind:
            raise ValueError("Малый блайнд больше большого")
        return self


class CashSnapshotIn(BaseModel):
    """Все кэш-лимиты клуба за один заход. Лимита нет в списке — столы закрылись."""

    club_slug: str = Field(min_length=1, max_length=64)
    games: list[CollectedCashGame] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _unique_limits(self) -> CashSnapshotIn:
        keys = [(game.game_type, game.small_blind, game.big_blind) for game in self.games]
        if len(keys) != len(set(keys)):
            raise ValueError("Лимиты повторяются — столы одного лимита шлются одной строкой")
        return self


class CashSnapshotResult(BaseModel):
    added: int = 0
    updated: int = 0
    closed: int = 0


class CashGameRead(BaseModel):
    id: UUID
    club: TournamentClub
    game_type: GameType
    small_blind: Decimal
    big_blind: Decimal
    tables: int
    app_link: str | None
    seen_at: datetime
    # Большой блайнд в рублях по курсу клуба — для фильтра ставок; None без курса.
    big_blind_rub: Decimal | None
    # Отобрано в Editor's Pick; заметка — почему.
    is_editor_pick: bool = False
    editor_pick_note: str | None = None
