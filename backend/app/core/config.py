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
    app_name: str = "Day2"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://day2:day2@localhost:5432/day2"
    test_database_url: str = "postgresql+asyncpg://day2:day2@localhost:5433/day2_test"
    database_echo: bool = False
    seed_demo_data: bool = False
    cors_origins: str = "http://localhost:5173,http://localhost"

    # OTP / session
    otp_hmac_secret: str = Field(default="dev-otp-hmac-secret-change-me")
    # Used only when EMAIL_PROVIDER=mock in development/test.
    dev_otp_code: str = Field(default="123456")
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_min_interval_seconds: int = 60
    otp_daily_limit: int = 5
    otp_ip_hourly_limit: int = 20
    session_cookie_name: str = "day2_session"
    session_ttl_days: int = 30
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"

    # Password auth / email verification
    password_min_length: int = 8
    password_max_length: int = 128
    password_login_max_attempts: int = 5
    password_login_lockout_seconds: int = 900
    # Captcha after N prior OTP sends today (2 = starting from 3rd request).
    otp_captcha_after_count: int = 2
    # Existence probes (register/start account_exists, login OTP account_not_found).
    account_lookup_captcha_after_count: int = 5
    account_lookup_ip_hourly_limit: int = 60
    # Short-lived proof after register OTP verify (before password+nickname).
    register_token_ttl_seconds: int = 1800
    auth_token_ip_hourly_limit: int = 20
    frontend_base_url: str = "http://localhost:5173"
    # Internal URL to fetch SPA index.html when serving canonical /series|/events via Caddy.
    # Empty → minimal HTML stub (tests / local API-only).
    spa_internal_url: str = ""

    # Email adapter: mock (dev/test) | smtp
    email_provider: str = "mock"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_from_name: str = "Day2"
    # Port 465 → SMTP_SSL; port 587 → STARTTLS (smtp_use_tls).
    smtp_use_ssl: bool = False
    smtp_use_tls: bool = True

    # Captcha: mock | yandex
    captcha_provider: str = "mock"
    smartcaptcha_server_key: str = ""
    captcha_mock_token: str = "ok"

    # Web Push (VAPID). Private key is used by worker only.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "https://day2.n8nginger.ru"

    # Admin change-notification preview tokens (HMAC).
    preview_hmac_secret: str = Field(default="dev-preview-hmac-secret-change-me")
    preview_token_ttl_seconds: int = 600

    # Organizer logo uploads (admin).
    logo_max_file_bytes: int = Field(default=1 * 1024 * 1024, ge=1)
    logo_min_dimension: int = Field(default=120, ge=1)

    # Series schedule PDF export.
    pdf_cache_dir: str = "/tmp/day2-pdf-cache"
    pdf_generation_timeout_seconds: float = Field(default=15.0, gt=0)
    pdf_rate_limit_per_minute: int = Field(default=10, ge=1)

    # Ginger APP: сетки клубов разворачиваются в старты на горизонт вперёд; фоновая задача
    # бэкенда докручивает горизонт с этим интервалом. 0 — выключено.
    schedule_horizon_days: int = Field(default=14, ge=1, le=60)
    schedule_rollforward_interval_seconds: int = Field(default=6 * 3600, ge=0)
    # Сателлиты на турниры дешевле порога игрокам не показываем — это спам для нашей ЦА
    # с высоким чеком (решение Ивана 2026-09-13). В базе они остаются.
    minor_satellite_below_usd: int = Field(default=100, ge=0)
    minor_satellite_below_rub: int = Field(default=5000, ge=0)

    # Schedule import pipeline.
    import_max_file_bytes: int = Field(default=20 * 1024 * 1024, ge=1)
    import_confidence_threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    # mock | unconfigured (real Anthropic provider TBD)
    import_ai_provider: str = "mock"

    # Playing-card suit colors for new users (classic | four_color).

    # Seeded editor/admin for local development only.
    seed_admin_email: str = "admin@example.com"
    seed_admin_nickname: str = "admin"
    seed_editor_email: str = "editor@example.com"
    seed_editor_nickname: str = "editor"

    # Comma-separated emails that always get admin (any APP_ENV). Protected from demotion via UI.
    superadmin_emails: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def superadmin_emails_list(self) -> list[str]:
        return [item.strip().lower() for item in self.superadmin_emails.split(",") if item.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def allows_mock_email(self) -> bool:
        return self.is_development or self.is_test


@lru_cache
def get_settings() -> Settings:
    return Settings()
