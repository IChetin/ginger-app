from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.enums import LiveEventType, LiveSessionStatus
from app.schemas.schedule import CurrencyBrief


class LiveSessionCreate(BaseModel):
    id: UUID
    event_id: UUID | None = None
    flight_id: UUID | None = None
    manual_name: str | None = Field(default=None, min_length=1, max_length=160)
    manual_venue: str | None = Field(default=None, max_length=160)
    manual_buyin: Decimal | None = Field(default=None, ge=0)
    manual_currency: str | None = Field(default=None, min_length=3, max_length=3)
    started_at: datetime | None = None

    @field_validator("manual_currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @model_validator(mode="after")
    def _linked_or_manual(self) -> "LiveSessionCreate":
        has_event = self.event_id is not None
        has_manual = (
            self.manual_name is not None
            and self.manual_buyin is not None
            and self.manual_currency is not None
        )
        if has_event == has_manual:
            raise ValueError("Provide either event_id or manual name/buyin/currency")
        if self.flight_id is not None and self.event_id is None:
            raise ValueError("flight_id requires event_id")
        return self


class LiveEventCreateItem(BaseModel):
    id: UUID
    type: LiveEventType
    amount: Decimal | None = Field(default=None, ge=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    text: str | None = Field(default=None, min_length=1, max_length=500)
    occurred_at: datetime

    @field_validator("currency_code")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @model_validator(mode="after")
    def _payload(self) -> "LiveEventCreateItem":
        if self.type == LiveEventType.NOTE:
            if not self.text or not self.text.strip():
                raise ValueError("note requires text")
        elif self.amount is None:
            raise ValueError("entry/reentry requires amount")
        return self


class LiveEventsBatchCreate(BaseModel):
    events: list[LiveEventCreateItem] = Field(min_length=1, max_length=100)


class LiveEventUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, ge=0)
    occurred_at: datetime | None = None
    text: str | None = Field(default=None, min_length=1, max_length=500)


class LiveSessionFinish(BaseModel):
    in_the_money: bool = True
    place: int | None = Field(default=None, ge=1)
    field_size: int | None = Field(default=None, ge=1)
    payout: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def _place_field(self) -> "LiveSessionFinish":
        if not self.in_the_money:
            return self
        if self.place is not None and self.field_size is not None and self.place > self.field_size:
            raise ValueError("place must be less than or equal to field_size")
        return self


class LiveEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: LiveEventType
    amount: Decimal | None
    currency_code: str | None
    text: str | None
    occurred_at: datetime
    created_at: datetime

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class LiveSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID | None
    flight_id: UUID | None
    manual_name: str | None
    manual_venue: str | None
    manual_buyin: Decimal | None
    manual_currency: str | None
    started_at: datetime
    finished_at: datetime | None
    status: LiveSessionStatus
    place: int | None
    field_size: int | None
    payout: Decimal | None
    result_id: UUID | None
    display_name: str
    display_series: str | None
    buyin: Decimal
    currency: CurrencyBrief
    reentry_allowed: bool
    events: list[LiveEventRead]
    created_at: datetime
    updated_at: datetime

    @field_serializer("manual_buyin", "payout", "buyin")
    def serialize_money(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class LiveCandidateRead(BaseModel):
    event_id: UUID
    flight_id: UUID
    name: str
    series_name: str
    buyin: Decimal
    currency: CurrencyBrief
    start_at: datetime
    reentry_count: int | None
    reentry_unlimited: bool

    @field_serializer("buyin")
    def serialize_buyin(self, value: Decimal) -> str:
        return format(value, "f")
