from datetime import date, datetime
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

from app.models.enums import EntryType, LiveEventType


class ResultEventWrite(BaseModel):
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
    def _payload(self) -> "ResultEventWrite":
        if self.type == LiveEventType.NOTE:
            if not self.text or not self.text.strip():
                raise ValueError("note requires text")
        elif self.amount is None:
            raise ValueError("entry/reentry requires amount")
        return self


class ResultEventRead(BaseModel):
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


class ResultCreate(BaseModel):
    event_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    venue_text: str | None = Field(default=None, max_length=160)
    series_text: str | None = Field(default=None, max_length=160)
    played_on: date | None = None
    buyin: Decimal | None = Field(default=None, ge=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    entries_count: int = Field(default=1, ge=1, le=1000)
    payout: Decimal = Field(default=Decimal("0"), ge=0)
    place: int | None = Field(default=None, ge=1)
    field_size: int | None = Field(default=None, ge=1)
    note: str | None = None
    events: list[ResultEventWrite] | None = None

    @field_validator("currency_code")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @model_validator(mode="after")
    def _place_field(self) -> "ResultCreate":
        if self.place is not None and self.field_size is not None and self.place > self.field_size:
            raise ValueError("place must be less than or equal to field_size")
        return self


class ResultUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    venue_text: str | None = Field(default=None, max_length=160)
    series_text: str | None = Field(default=None, max_length=160)
    played_on: date | None = None
    buyin: Decimal | None = Field(default=None, ge=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    entries_count: int | None = Field(default=None, ge=1, le=1000)
    payout: Decimal | None = Field(default=None, ge=0)
    place: int | None = Field(default=None, ge=1)
    field_size: int | None = Field(default=None, ge=1)
    note: str | None = None
    events: list[ResultEventWrite] | None = None

    @field_validator("currency_code")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class ResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    entry_type: EntryType
    event_id: UUID | None
    name: str
    venue_text: str | None
    series_text: str | None
    played_on: date
    buyin: Decimal
    currency_code: str
    entries_count: int
    payout: Decimal
    place: int | None
    field_size: int | None
    note: str | None
    events: list[ResultEventRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @field_serializer("buyin", "payout")
    def serialize_money(self, value: Decimal) -> str:
        return format(value, "f")


class ResultListItem(ResultRead):
    profit_base: Decimal
    base_currency: str

    @field_serializer("profit_base")
    def serialize_profit_base(self, value: Decimal) -> str:
        return format(value, "f")


class ResultEventSearchItem(BaseModel):
    event_id: UUID
    name: str
    series_name: str
    venue_name: str
    played_on: date
    buyin: Decimal
    currency_code: str
    currency_symbol: str

    @field_serializer("buyin")
    def serialize_buyin(self, value: Decimal) -> str:
        return format(value, "f")
