from pydantic import BaseModel, Field, field_validator


class PushPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=500)
    url: str = Field(min_length=1, max_length=500)
    type: str = "reminder"
    offset_minutes: int | None = None
    event_id: str | None = None
    flight_id: str | None = None

    @field_validator("url")
    @classmethod
    def validate_relative_url(cls, value: str) -> str:
        if not value.startswith("/") or value.startswith("//"):
            raise ValueError("url must be a same-origin relative path")
        return value
