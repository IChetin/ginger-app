from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BountyKind, GameType, PokerApp, TournamentStatus


class TournamentFields(BaseModel):
    """Поля турнира, общие для шаблона и старта. Суммы — в фишках клуба."""

    name: str = Field(min_length=1, max_length=160)
    game_type: GameType = GameType.NLH
    bounty_kind: BountyKind = BountyKind.NONE
    buyin: Decimal = Field(ge=0)
    guarantee: Decimal | None = Field(default=None, ge=0)
    rebuy_cost: Decimal | None = Field(default=None, ge=0)
    rebuy_terms: str | None = Field(default=None, max_length=32)
    addon_cost: Decimal | None = Field(default=None, ge=0)
    addon_terms: str | None = Field(default=None, max_length=32)
    start_stack: int | None = Field(default=None, ge=0)
    table_size: int | None = Field(default=None, ge=2, le=10)
    late_reg_levels: int | None = Field(default=None, ge=1)
    level_minutes: str | None = Field(default=None, max_length=16)
    structure: str | None = Field(default=None, max_length=32)
    ticket_value: Decimal | None = Field(default=None, ge=0)
    early_bird_players: int | None = Field(default=None, ge=0)
    notes: str | None = None


class TemplateDraft(TournamentFields):
    """Шаблон регулярного турнира, извлечённый из источника (CSV союза, афиша)."""

    weekdays: list[int] = Field(min_length=1)
    start_time: time
    late_reg_close_offset_min: int | None = Field(default=None, ge=0)


class ParseIssue(BaseModel):
    row: int | None = None
    message: str


class TemplateParseResult(BaseModel):
    templates: list[TemplateDraft]
    issues: list[ParseIssue] = Field(default_factory=list)
    rows_total: int = 0


class TemplateRead(TemplateDraft):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    club_id: UUID
    is_active: bool
    source: str | None
    password: str | None
    is_promoted: bool


class TemplatesImportResult(BaseModel):
    """Итог импорта сетки. При dry_run изменения посчитаны и откатаны."""

    dry_run: bool
    rows_total: int
    templates_parsed: int
    issues: list[ParseIssue]
    templates_created: int
    templates_updated: int
    templates_unchanged: int
    templates_removed: int
    tournaments_created: int
    tournaments_updated: int
    tournaments_deleted: int
    tournaments_detached_kept: int


class TournamentClub(BaseModel):
    id: UUID
    name: str
    slug: str
    app: PokerApp
    chip_value: Decimal | None
    chip_currency_code: str | None
    # Символ перед суммой: USDT показываем как «$» (решение Ивана 2026-09-13).
    currency_symbol: str | None


class TournamentRead(TournamentFields):
    id: UUID
    club: TournamentClub
    starts_at: datetime
    late_reg_closes_at: datetime | None
    status: TournamentStatus
    is_promoted: bool
    # Бай-ин в рублях по курсу клуба — «примерно», для фильтра и подписи. None, если курс
    # клуба или валюты не задан.
    buyin_rub: Decimal | None
    guarantee_rub: Decimal | None
    has_addon: bool
