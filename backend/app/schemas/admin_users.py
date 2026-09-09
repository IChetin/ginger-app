from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class AdminUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    nickname: str
    role: UserRole
    is_superadmin: bool
    email_verified: bool
    created_at: datetime


class AdminUserRoleUpdate(BaseModel):
    role: UserRole = Field(description="New role for the user")
