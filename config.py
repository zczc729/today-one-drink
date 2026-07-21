import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


def _int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)

    if raw_value is None:
        return default

    try:
        value = int(raw_value)
    except ValueError:
        return default

    return value if value > 0 else default


@dataclass(frozen=True)
class Settings:
    redis_url: str = os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
    redis_token: str = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()
    global_rpm_limit: int = _int_env("GLOBAL_RPM_LIMIT", 12)
    global_rpd_limit: int = _int_env("GLOBAL_RPD_LIMIT", 400)
    gemini_rpm_limit: int = _int_env("GEMINI_RPM_LIMIT", 15)
    gemini_rpd_limit: int = _int_env("GEMINI_RPD_LIMIT", 500)
    user_rpm_limit: int = _int_env("USER_RPM_LIMIT", 3)
    session_request_limit: int = _int_env("SESSION_REQUEST_LIMIT", 15)
    request_lock_ttl_seconds: int = _int_env(
        "REQUEST_LOCK_TTL_SECONDS", 30
    )
    duplicate_request_ttl_seconds: int = _int_env(
        "DUPLICATE_REQUEST_TTL_SECONDS", 600
    )
    analytics_retention_days: int = _int_env(
        "ANALYTICS_RETENTION_DAYS", 14
    )
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin").strip()
    admin_password_hash: str = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
    admin_session_secret: str = os.getenv("ADMIN_SESSION_SECRET", "").strip()
    anonymization_secret: str = os.getenv(
        "ANONYMIZATION_SECRET",
        os.getenv(
            "ADMIN_SESSION_SECRET",
            os.getenv("UPSTASH_REDIS_REST_TOKEN", ""),
        ),
    ).strip()
    admin_session_max_age_seconds: int = _int_env(
        "ADMIN_SESSION_MAX_AGE_SECONDS", 14400
    )
    admin_login_max_attempts: int = _int_env(
        "ADMIN_LOGIN_MAX_ATTEMPTS", 5
    )
    admin_login_window_seconds: int = _int_env(
        "ADMIN_LOGIN_WINDOW_SECONDS", 600
    )
    gemini_request_timeout_ms: int = _int_env(
        "GEMINI_REQUEST_TIMEOUT_MS", 25000
    )
    environment: str = os.getenv(
        "ENVIRONMENT",
        os.getenv("VERCEL_ENV", "development"),
    ).strip().lower()

    @property
    def admin_is_configured(self) -> bool:
        return bool(
            self.admin_username
            and self.admin_password_hash
            and self.admin_session_secret
        )

    @property
    def secure_admin_cookie(self) -> bool:
        return self.environment in {"production", "prod"} or bool(
            os.getenv("VERCEL")
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
