from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BountyKind, GameType, PokerApp, ReminderKind, TournamentStatus


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
    satellite_target: str | None = Field(default=None, max_length=160)
    early_bird_players: int | None = Field(default=None, ge=0)
    lobby_name: str | None = Field(default=None, max_length=160)
    bounty_share: int | None = Field(default=None, ge=1, le=100)
    early_bird_bonus: str | None = Field(default=None, max_length=64)
    early_bird_levels: int | None = Field(default=None, ge=1, le=50)
    has_jackpot: bool = False
    live_event: str | None = Field(default=None, max_length=160)
    live_dates: str | None = Field(default=None, max_length=64)
    live_step: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None


class TemplateDraft(TournamentFields):
    """Шаблон регулярного турнира, извлечённый из источника (CSV союза, афиша)."""

    weekdays: list[int] = Field(min_length=1)
    start_time: time
    # Разовое событие (турнир месяца, серия): valid_from = valid_until = дата.
    valid_from: date | None = None
    valid_until: date | None = None
    # Турнир месяца: номер недели месяца (1–5) или -1 — последняя.
    month_week: int | None = Field(default=None, ge=-1, le=5)
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
    # ID клуба в приложении — для приложений без диплинков игрок входит по нему.
    app_club_id: str | None = None


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
    # До какого момента действует Early Bird: старт + N уровней с перерывами, как у поздней реги.
    early_bird_closes_at: datetime | None = None
    app_link: str | None = None


class TemplateDeleteResult(BaseModel):
    """Турнир убран из сетки: сколько будущих стартов пропало из расписания."""

    tournaments_deleted: int


class TournamentReminderRead(BaseModel):
    tournament_id: UUID
    kind: ReminderKind


class TournamentRemindersUpdate(BaseModel):
    """Какие колокольчики должны стоять на турнире; пустой список снимает все."""

    kinds: list[ReminderKind] = Field(default_factory=list, max_length=2)


class LiveEventRead(BaseModel):
    """Живая серия: шаги-сателлиты и сам турнир серии, отдельно от онлайн-расписания."""

    title: str
    dates: str | None
    club: TournamentClub
    items: list[TournamentRead]
