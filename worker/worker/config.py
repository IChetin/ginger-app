from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = "postgresql+asyncpg://day2:day2@localhost:5432/day2"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "https://lisa52.com"
    # Telegram-бот уведомлений — второй канал; пусто — такие уведомления не отправляются.
    telegram_bot_token: str = ""
    telegram_timeout_seconds: float = Field(default=10, ge=1, le=60)
    # Куда ведёт кнопка «Открыть в Ginger» в сообщении бота.
    frontend_base_url: str = "https://lisa52.com"
    notification_batch_size: int = Field(default=50, ge=1, le=500)
    notification_job_interval_seconds: int = Field(default=60, ge=10, le=3600)

    # CBR FX daily job (cron in UTC).
    fx_job_cron: str = "15 1 * * *"
    cbr_base_url: str = "https://www.cbr.ru/scripts/XML_daily.asp"
    cbr_timeout_seconds: float = Field(default=15, ge=1, le=120)
    cbr_retries: int = Field(default=3, ge=1, le=10)

    @property
    def database_url_sync(self) -> str:
        url = self.database_url
        if url.startswith("postgresql+asyncpg://"):
            return "postgresql+psycopg://" + url.removeprefix("postgresql+asyncpg://")
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url.removeprefix("postgresql://")
        return url

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
