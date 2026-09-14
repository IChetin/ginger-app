from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import (
    ChipRequestKind,
    ChipRequestStatus,
    PlayerAccountStatus,
    PlayerKind,
    PlayerStatus,
    PokerApp,
)


class AccountClub(BaseModel):
    id: UUID
    name: str
    slug: str
    app: PokerApp
    chip_value: Decimal | None
    chip_currency_code: str | None
    currency_symbol: str | None


class PlayerAccountRead(BaseModel):
    id: UUID
    club: AccountClub
    nickname: str
    app_account_id: str
    status: PlayerAccountStatus
    created_at: datetime


class PlayerAccountCreate(BaseModel):
    club_id: UUID
    nickname: str = Field(min_length=1, max_length=64)
    app_account_id: str = Field(min_length=1, max_length=32)


class PlayerMe(BaseModel):
    id: UUID
    kind: PlayerKind
    status: PlayerStatus
    offline_access: bool
    results_consent: bool
    birthday: date | None
    accounts: list[PlayerAccountRead]
    # Касса 12:00–03:00 МСК. Заявку можно оставить всегда — это только честная подпись.
    cashdesk_open: bool
    cashdesk_hours: str


class PlayerMeUpdate(BaseModel):
    results_consent: bool | None = None
    birthday: date | None = None


class ChipRequestItemCreate(BaseModel):
    account_id: UUID
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class ChipRequestCreate(BaseModel):
    kind: ChipRequestKind = ChipRequestKind.TOPUP
    items: list[ChipRequestItemCreate] = Field(min_length=1, max_length=10)
    withdrawal_requisites: str | None = Field(default=None, max_length=1000)


class MoneyTotal(BaseModel):
    currency_code: str
    currency_symbol: str | None
    amount: Decimal


class ChipRequestItemRead(BaseModel):
    id: UUID
    account_id: UUID
    account_nickname: str
    account_app_id: str
    club: AccountClub
    amount: Decimal
    chip_value: Decimal | None
    chip_currency_code: str | None
    # Сумма в деньгах: фишки × курс клуба на момент заявки.
    money_amount: Decimal | None


class ChipRequestEventRead(BaseModel):
    from_status: ChipRequestStatus | None
    to_status: ChipRequestStatus
    comment: str | None
    actor_nickname: str | None
    created_at: datetime


class ChipRequestRead(BaseModel):
    id: UUID
    kind: ChipRequestKind
    status: ChipRequestStatus
    items: list[ChipRequestItemRead]
    totals: list[MoneyTotal]
    payment_requisites: str | None
    payment_deadline_at: datetime | None
    has_screenshot: bool
    withdrawal_requisites: str | None
    reject_comment: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class PlayerBrief(BaseModel):
    id: UUID
    nickname: str
    email: str
    kind: PlayerKind
    status: PlayerStatus


class ChipRequestAdminRead(ChipRequestRead):
    player: PlayerBrief
    handled_by_nickname: str | None
    events: list[ChipRequestEventRead]


class RequisitesBody(BaseModel):
    """Реквизиты депозитному: из сохранённого шаблона или текстом (вопрос 11.11)."""

    template_id: UUID | None = None
    text: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def one_source(self) -> RequisitesBody:
        if (self.template_id is None) == (not (self.text or "").strip()):
            raise ValueError("Укажите шаблон реквизитов или текст — что-то одно")
        return self


class RejectBody(BaseModel):
    # Отказ — это сообщение игроку, а не ошибка: комментарий обязателен (ТЗ §3.1).
    comment: str = Field(min_length=1, max_length=1000)


class RequisiteTemplateRead(BaseModel):
    id: UUID
    title: str
    body: str
    is_active: bool
    sort_order: int


class RequisiteTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=64)
    body: str = Field(min_length=1, max_length=2000)
    sort_order: int = 0


class RequisiteTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=64)
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    is_active: bool | None = None
    sort_order: int | None = None


class PlayerAdminRead(BaseModel):
    id: UUID
    user_id: UUID
    nickname: str
    email: str
    kind: PlayerKind
    status: PlayerStatus
    offline_access: bool
    results_consent: bool
    birthday: date | None
    notes: str | None
    referrer_player_id: UUID | None
    accounts: list[PlayerAccountRead]
    created_at: datetime
    invited_total: int = 0
    invited_24h: int = 0
    referral_paused: bool = False
    # Mini-CRM (ТЗ §9а.3).
    real_name: str | None = None
    phone: str | None = None
    telegram: str | None = None
    source: str | None = None
    tags: list[str] = Field(default_factory=list)
    last_seen_at: datetime | None = None
    last_request_at: datetime | None = None
    last_activity_at: datetime | None = None
    requests_30d: int = 0
    sleeping: bool = False
    days_to_birthday: int | None = None


class PlayerAdminUpdate(BaseModel):
    kind: PlayerKind | None = None
    status: PlayerStatus | None = None
    offline_access: bool | None = None
    notes: str | None = None
    real_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    telegram: str | None = Field(default=None, max_length=64)
    source: str | None = Field(default=None, max_length=64)
    birthday: date | None = None
    tags: list[str] | None = Field(default=None, max_length=20)


class PendingAccountRead(PlayerAccountRead):
    player_id: UUID
    player_nickname: str


class InviteCreate(BaseModel):
    player_kind: PlayerKind = PlayerKind.CREDIT
    note: str | None = Field(default=None, max_length=200)


class InviteRead(BaseModel):
    id: UUID
    player_kind: PlayerKind
    note: str | None
    state: str  # active | used | expired | revoked
    expires_at: datetime
    used_at: datetime | None
    used_by_nickname: str | None
    revoked_at: datetime | None
    created_at: datetime


class InviteCreated(InviteRead):
    # Токен виден один раз — в базе только хэш.
    token: str
    path: str


class InviteCheck(BaseModel):
    valid: bool
    reason: str | None
    # Для личной ссылки: «Вас пригласил …».
    referrer_nickname: str | None = None


class ReferralRead(BaseModel):
    code: str
    path: str
    invited_total: int
    registrations_24h: int
    daily_limit: int
    # Лимит регистраций за сутки исчерпан — ссылка не работает, пока не пройдут сутки
    # или код не перевыпустят.
    paused: bool
