from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import NotificationStatus, NotificationType


class NotificationHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: NotificationType
    title: str
    body: str
    url: str
    status: NotificationStatus
    scheduled_at: datetime
    sent_at: datetime | None
    created_at: datetime


class NotificationListItem(BaseModel):
    id: UUID
    type: NotificationType
    title: str
    body: str
    url: str
    sent_at: datetime | None
    read_at: datetime | None
    is_unread: bool


class NotificationListResponse(BaseModel):
    items: list[NotificationListItem]
    total: int
    limit: int
    offset: int
    has_more: bool


class NotificationReadRequest(BaseModel):
    ids: list[UUID] | None = None
    all: bool = False

    @model_validator(mode="after")
    def validate_target(self) -> Self:
        if self.all or self.ids:
            return self
        raise ValueError("Provide ids or all=true")


class NotificationReadResponse(BaseModel):
    marked: int = Field(ge=0)


class NotificationUnreadCountResponse(BaseModel):
    count: int = Field(ge=0)
