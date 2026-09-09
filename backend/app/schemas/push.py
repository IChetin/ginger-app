from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class VapidPublicKeyResponse(BaseModel):
    public_key: str


class PushSubscribeBody(BaseModel):
    endpoint: HttpUrl
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=256)
    device_label: str | None = Field(default=None, max_length=64)


class PushUnsubscribeBody(BaseModel):
    endpoint: HttpUrl


class PushSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    endpoint: str
    device_label: str | None
    created_at: datetime
    last_success_at: datetime | None
