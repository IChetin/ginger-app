from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.config import get_settings
from app.core.nickname import validate_nickname
from app.core.password_policy import is_common_password
from app.models.enums import UserRole


def _password_bounds() -> tuple[int, int]:
    settings = get_settings()
    return settings.password_min_length, settings.password_max_length


def _validate_password(value: str) -> str:
    min_len, max_len = _password_bounds()
    if len(value) < min_len:
        raise ValueError(f"Пароль должен быть не короче {min_len} символов")
    if len(value) > max_len:
        raise ValueError(f"Пароль должен быть не длиннее {max_len} символов")
    if value.strip() != value:
        raise ValueError("Пароль не должен начинаться или заканчиваться пробелом")
    if is_common_password(value):
        raise ValueError("Этот пароль слишком распространён — выберите другой")
    return value


class RequestCodeBody(BaseModel):
    email: EmailStr
    captcha_token: str | None = None


class VerifyCodeBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8, pattern=r"^[0-9]+$")


class RequestCodeResponse(BaseModel):
    ok: bool = True
    expires_in_seconds: int
    retry_after: int


class RegisterStartBody(BaseModel):
    email: EmailStr
    captcha_token: str | None = None
    # Ginger APP: регистрация только по приглашению (ТЗ §5, вопрос 11.8).
    invite_token: str | None = Field(default=None, max_length=128)
    privacy_consent: bool = False

    @model_validator(mode="after")
    def require_consent(self) -> "RegisterStartBody":
        if not self.privacy_consent:
            raise ValueError("Нужно согласие на обработку персональных данных")
        return self


class RegisterVerifyBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8, pattern=r"^[0-9]+$")


class RegisterVerifyResponse(BaseModel):
    registration_token: str
    expires_in_seconds: int


class RegisterCompleteBody(BaseModel):
    registration_token: str = Field(min_length=16, max_length=256)
    password: str = Field(min_length=1, max_length=128)
    nickname: str = Field(min_length=2, max_length=32)
    invite_token: str | None = Field(default=None, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("nickname")
    @classmethod
    def check_nickname(cls, value: str) -> str:
        return validate_nickname(value)


class LoginPasswordBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SetPasswordBody(BaseModel):
    password: str = Field(min_length=1, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class GenericAuthMessage(BaseModel):
    ok: bool = True
    message: str


class UpdateMeBody(BaseModel):
    nickname: str | None = Field(default=None, min_length=2, max_length=32)
    schedule_view: Literal["cards", "table"] | None = None

    @field_validator("nickname")
    @classmethod
    def check_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_nickname(value)


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    phone: str | None
    nickname: str
    schedule_view: Literal["cards", "table"]
    role: UserRole
    email_verified: bool
    has_password: bool
    created_at: datetime
