import base64
import hashlib
import hmac
import json
import time
from typing import Optional

import bcrypt

from config import Settings, get_settings
from services.errors import RedisServiceUnavailable, ServiceError
from services.privacy import hash_identifier
from services.rate_limiter import PREFIX
from services.redis_client import get_redis_client, redis_command


ADMIN_COOKIE_NAME = "today_one_drink_admin"


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


class AdminAuthService:
    def __init__(self, settings: Settings = None, redis=None) -> None:
        self.settings = settings or get_settings()
        self.redis = redis or get_redis_client()

    def ensure_configured(self) -> None:
        if not self.settings.admin_is_configured:
            raise ServiceError(
                503,
                "ADMIN_NOT_CONFIGURED",
                "관리자 로그인 환경변수가 설정되지 않았습니다.",
                None,
            )

    def login_limit_key(self, client_identifier: str) -> str:
        hashed_client = hash_identifier(
            client_identifier,
            "admin-login-client",
            self.settings.anonymization_secret,
        )
        return f"{PREFIX}:admin:login-limit:{hashed_client}"

    def assert_login_allowed(self, client_identifier: str) -> str:
        self.ensure_configured()
        key = self.login_limit_key(client_identifier)
        attempts = redis_command(self.redis.get, key)

        if int(attempts or 0) >= self.settings.admin_login_max_attempts:
            retry_after = redis_command(self.redis.ttl, key)
            raise ServiceError(
                429,
                "ADMIN_LOGIN_RATE_LIMITED",
                "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                max(1, int(retry_after or 1)),
            )
        return key

    def record_login_failure(self, key: str) -> None:
        attempts = redis_command(self.redis.incr, key)
        if int(attempts) == 1:
            redis_command(
                self.redis.expire,
                key,
                self.settings.admin_login_window_seconds,
            )

    def verify_credentials(self, username: str, password: str) -> bool:
        self.ensure_configured()
        username_matches = hmac.compare_digest(
            username,
            self.settings.admin_username,
        )
        try:
            password_matches = bcrypt.checkpw(
                password.encode("utf-8"),
                self.settings.admin_password_hash.encode("utf-8"),
            )
        except (ValueError, TypeError):
            password_matches = False

        return username_matches and password_matches

    def clear_login_failures(self, key: str) -> None:
        redis_command(self.redis.delete, key)

    def create_session_token(self, now: int = None) -> str:
        self.ensure_configured()
        issued_at = int(now or time.time())
        payload = {
            "u": self.settings.admin_username,
            "iat": issued_at,
            "exp": issued_at + self.settings.admin_session_max_age_seconds,
        }
        encoded_payload = _b64encode(
            json.dumps(
                payload,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        )
        signature = hmac.new(
            self.settings.admin_session_secret.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        return f"{encoded_payload}.{_b64encode(signature)}"

    def verify_session_token(
        self,
        token: Optional[str],
        now: int = None,
    ) -> bool:
        if not token or not self.settings.admin_is_configured:
            return False

        try:
            encoded_payload, encoded_signature = token.split(".", 1)
            expected = hmac.new(
                self.settings.admin_session_secret.encode("utf-8"),
                encoded_payload.encode("ascii"),
                hashlib.sha256,
            ).digest()
            supplied = _b64decode(encoded_signature)
            if not hmac.compare_digest(expected, supplied):
                return False
            payload = json.loads(_b64decode(encoded_payload))
            current_time = int(now or time.time())
            return bool(
                payload.get("u") == self.settings.admin_username
                and int(payload.get("iat", 0)) <= current_time
                and int(payload.get("exp", 0)) > current_time
            )
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return False


def client_identifier_from_request(request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return "unknown-client"
