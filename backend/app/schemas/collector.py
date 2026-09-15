from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    BountyKind,
    CollectorRunKind,
    CollectorRunStatus,
    GameType,
    PokerApp,
    TournamentChangeKind,
    TournamentChangeStatus,
)

# Диплинк ведёт в приложение или на https-страницу; javascript: и прочее не пускаем.
_LINK_PREFIXES = ("https://", "http://", "pppoker://", "xpoker://", "poker21://", "suprema://")


def validate_app_link(value: str | None) -> str | None:
    """Диплинк турнира или стола: в приложение или на https-страницу."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned.lower().startswith(_LINK_PREFIXES):
        raise ValueError("Ссылка должна вести в приложение или на https")
    return cleaned


def _require_timezone(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("Время — с часовым поясом")
    return value


class CollectedTournament(BaseModel):
    """Турнир, как его увидел сборщик в лобби. Суммы — в фишках клуба."""

    starts_at: datetime
    name: str = Field(min_length=1, max_length=160)
    buyin: Decimal | None = Field(default=None, ge=0)
    guarantee: Decimal | None = Field(default=None, ge=0)
    bounty_kind: BountyKind | None = None
    game_type: GameType | None = None
    start_stack: int | None = Field(default=None, ge=0)
    level_minutes: str | None = Field(default=None, max_length=16)
    late_reg_levels: int | None = Field(default=None, ge=1)
    table_size: int | None = Field(default=None, ge=2, le=10)
    structure: str | None = Field(default=None, max_length=32)
    rebuy_cost: Decimal | None = Field(default=None, ge=0)
    rebuy_terms: str | None = Field(default=None, max_length=32)
    addon_cost: Decimal | None = Field(default=None, ge=0)
    addon_terms: str | None = Field(default=None, max_length=32)
    bounty_share: int | None = Field(default=None, ge=1, le=100)
    early_bird_bonus: str | None = Field(default=None, max_length=64)
    early_bird_levels: int | None = Field(default=None, ge=1, le=50)
    app_link: str | None = Field(default=None, max_length=500)

    _aware = field_validator("starts_at")(_require_timezone)
    _link = field_validator("app_link")(validate_app_link)


class RunStart(BaseModel):
    kind: CollectorRunKind
    app: PokerApp


class RunFinish(BaseModel):
    status: Literal["ok", "failed"]
    error: str | None = Field(default=None, max_length=2000)
    stats: dict[str, Any] = Field(default_factory=dict)


class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: CollectorRunKind
    app: PokerApp
    status: CollectorRunStatus
    started_at: datetime
    finished_at: datetime | None
    error: str | None
    stats: dict[str, Any]


class SnapshotIn(BaseModel):
    """Лобби одного клуба за проход: турниры и окно времени, которое сборщик просмотрел.

    Турнир из сетки в этом окне, которого нет в лобби, считается пропавшим.
    """

    club_slug: str = Field(min_length=1, max_length=64)
    window_from: datetime
    window_to: datetime
    tournaments: list[CollectedTournament] = Field(default_factory=list, max_length=500)

    _aware = field_validator("window_from", "window_to")(_require_timezone)


class SnapshotResult(BaseModel):
    matched: int = 0
    details_updated: int = 0
    links_updated: int = 0
    new: int = 0
    missing: int = 0
    changed: int = 0


class TournamentChangeRead(BaseModel):
    id: UUID
    club_id: UUID
    club_name: str
    app: PokerApp
    tournament_id: UUID | None
    kind: TournamentChangeKind
    status: TournamentChangeStatus
    starts_at: datetime
    title: str
    payload: dict[str, Any]
    created_at: datetime


class CollectorStatus(BaseModel):
    """Жив ли сборщик: последний проход по каждому приложению и виду, сколько ждёт решений."""

    runs: list[RunRead]
    pending_changes: int
