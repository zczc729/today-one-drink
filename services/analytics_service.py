import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List

from config import Settings, get_settings
from services.privacy import hash_identifier
from services.rate_limiter import PREFIX, RateLimiter
from services.redis_client import get_redis_client, redis_command
from services.time_utils import now_kst, now_pacific


logger = logging.getLogger(__name__)


VISIT_SCRIPT = r"""
-- tod_analytics_visit_v1
local is_new = redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1])
if is_new then
    redis.call('INCR', KEYS[2])
end
redis.call('EXPIRE', KEYS[2], ARGV[1])
redis.call('ZADD', KEYS[3], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[3], ARGV[1])
return is_new and 1 or 0
"""


CHAT_ACCEPTED_SCRIPT = r"""
-- tod_analytics_chat_v1
local is_new = redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1])
if is_new then
    redis.call('INCR', KEYS[2])
end
redis.call('EXPIRE', KEYS[2], ARGV[1])
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], ARGV[1])
redis.call('ZADD', KEYS[4], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[4], ARGV[1])
return is_new and 1 or 0
"""


class AnalyticsService:
    def __init__(self, settings: Settings = None, redis=None) -> None:
        self.settings = settings or get_settings()
        self.redis = redis or get_redis_client()

    @property
    def retention_seconds(self) -> int:
        return self.settings.analytics_retention_days * 86_400

    @staticmethod
    def _date_key() -> str:
        return now_kst().date().isoformat()

    @staticmethod
    def _analytics_key(metric: str, date_key: str = None) -> str:
        if date_key:
            return f"{PREFIX}:analytics:{metric}:{date_key}"
        return f"{PREFIX}:analytics:{metric}"

    def _safe(self, operation, *args, **kwargs):
        try:
            return operation(*args, **kwargs)
        except Exception as exc:
            logger.warning(
                "Analytics write failed (%s).",
                type(exc).__name__,
            )
            self._best_effort_redis_error()
            return None

    def _best_effort_redis_error(self) -> None:
        try:
            key = self._analytics_key("redis-errors", self._date_key())
            self.redis.incr(key)
            self.redis.expire(key, self.retention_seconds)
        except Exception:
            pass

    def _increment(self, metric: str, amount: int = 1) -> None:
        key = self._analytics_key(metric, self._date_key())
        redis_command(self.redis.incrby, key, amount)
        redis_command(self.redis.expire, key, self.retention_seconds)

    def record_visit(self, session_id: str) -> bool:
        return bool(self._safe(self._record_visit, session_id))

    def _record_visit(self, session_id: str) -> bool:
        date_key = self._date_key()
        hashed = hash_identifier(
            session_id,
            "analytics-session",
            self.settings.anonymization_secret,
        )
        marker = self._analytics_key(
            f"visitor:{date_key}:{hashed}"
        )
        visitor_count = self._analytics_key("visitors", date_key)
        active_key = self._analytics_key("active-sessions")
        result = redis_command(
            self.redis.eval,
            VISIT_SCRIPT,
            keys=[marker, visitor_count, active_key],
            args=[
                str(self.retention_seconds),
                str(int(time.time() * 1000)),
                hashed,
            ],
        )
        return bool(int(result or 0))

    def record_chat_accepted(self, session_id: str) -> None:
        self._safe(self._record_chat_accepted, session_id)

    def _record_chat_accepted(self, session_id: str) -> None:
        date_key = self._date_key()
        hashed = hash_identifier(
            session_id,
            "analytics-session",
            self.settings.anonymization_secret,
        )
        marker = self._analytics_key(
            f"chat-user:{date_key}:{hashed}"
        )
        redis_command(
            self.redis.eval,
            CHAT_ACCEPTED_SCRIPT,
            keys=[
                marker,
                self._analytics_key("chat-users", date_key),
                self._analytics_key("chat-messages", date_key),
                self._analytics_key("active-sessions"),
            ],
            args=[
                str(self.retention_seconds),
                str(int(time.time() * 1000)),
                hashed,
            ],
        )

    def record_success(self, response_ms: int) -> None:
        self._safe(self._record_success, max(0, int(response_ms)))

    def _record_success(self, response_ms: int) -> None:
        date_key = self._date_key()
        metric_keys = {
            "successful-responses": 1,
            "response-ms-total": response_ms,
            "response-count": 1,
        }
        for metric, amount in metric_keys.items():
            key = self._analytics_key(metric, date_key)
            redis_command(self.redis.incrby, key, amount)
            redis_command(self.redis.expire, key, self.retention_seconds)

        latest_key = self._analytics_key("latest-response-ms")
        redis_command(
            self.redis.set,
            latest_key,
            response_ms,
            ex=self.retention_seconds,
        )

    def record_limit(self, error_code: str) -> None:
        metric_by_code = {
            "SESSION_LIMIT_REACHED": "session-limit",
            "USER_RATE_LIMITED": "user-rate-limited",
            "GLOBAL_RATE_LIMITED": "global-rate-limited",
            "DAILY_LIMIT_REACHED": "daily-limit",
            "DUPLICATE_REQUEST": "duplicate-blocked",
        }
        metric = metric_by_code.get(error_code)
        if metric:
            self._safe(self._increment, metric)

    def record_gemini_error(self, status_code: int) -> None:
        if status_code == 429:
            metric = "gemini-429"
        elif status_code == 503:
            metric = "gemini-503"
        else:
            metric = "gemini-errors"
        self._safe(self._increment, metric)

    @staticmethod
    def _to_int(value) -> int:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0

    def _read_numbers(self, keys: Iterable[str]) -> List[int]:
        key_list = list(keys)
        if not key_list:
            return []
        values = redis_command(self.redis.mget, *key_list)
        return [self._to_int(value) for value in values]

    def dashboard(self) -> Dict:
        kst_now = now_kst()
        pacific_now = now_pacific()
        traffic_date = kst_now.date().isoformat()
        quota_date = pacific_now.date().isoformat()
        dates = [
            (kst_now.date() - timedelta(days=offset)).isoformat()
            for offset in range(6, -1, -1)
        ]
        daily_metrics = [
            "visitors",
            "chat-users",
            "chat-messages",
            "successful-responses",
        ]
        seven_day_keys = [
            self._analytics_key(metric, date_key)
            for date_key in dates
            for metric in daily_metrics
        ]
        seven_day_values = self._read_numbers(seven_day_keys)
        last_7_days = []

        for index, date_key in enumerate(dates):
            start = index * len(daily_metrics)
            values = seven_day_values[start:start + len(daily_metrics)]
            last_7_days.append(
                {
                    "date": date_key,
                    "visitors": values[0],
                    "chat_users": values[1],
                    "chat_messages": values[2],
                    "successful_chats": values[3],
                }
            )

        today = last_7_days[-1]
        visitors = today["visitors"]
        chat_users = today["chat_users"]
        chat_messages = today["chat_messages"]
        current_ms = int(time.time() * 1000)
        active_key = self._analytics_key("active-sessions")
        redis_command(
            self.redis.zremrangebyscore,
            active_key,
            "-inf",
            current_ms - 300_000,
        )
        active_users = self._to_int(
            redis_command(self.redis.zcard, active_key)
        )

        auxiliary_keys = [
            f"{PREFIX}:quota:gemini:{quota_date}",
            self._analytics_key("session-limit", traffic_date),
            self._analytics_key("user-rate-limited", traffic_date),
            self._analytics_key("global-rate-limited", traffic_date),
            self._analytics_key("daily-limit", traffic_date),
            self._analytics_key("duplicate-blocked", traffic_date),
            self._analytics_key("gemini-429", traffic_date),
            self._analytics_key("gemini-503", traffic_date),
            self._analytics_key("gemini-errors", traffic_date),
            self._analytics_key("redis-errors", traffic_date),
            self._analytics_key("response-ms-total", traffic_date),
            self._analytics_key("response-count", traffic_date),
            self._analytics_key("latest-response-ms"),
        ]
        (
            attempts,
            session_limited,
            user_limited,
            global_limited,
            daily_limited,
            duplicates,
            gemini_429,
            gemini_503,
            gemini_other,
            redis_errors,
            response_total,
            response_count,
            latest_response,
        ) = self._read_numbers(auxiliary_keys)

        current_rpm = RateLimiter(
            settings=self.settings,
            redis=self.redis,
        ).current_global_rpm(current_ms)
        average_response = (
            round(response_total / response_count)
            if response_count
            else 0
        )

        return {
            "traffic_timezone": "Asia/Seoul",
            "quota_timezone": "America/Los_Angeles",
            "traffic_date": traffic_date,
            "quota_date": quota_date,
            "today": {
                "visitors": visitors,
                "chat_users": chat_users,
                "active_users_5m": active_users,
                "chat_messages": chat_messages,
                "successful_chats": today["successful_chats"],
                "average_messages_per_chat_user": round(
                    chat_messages / chat_users, 2
                ) if chat_users else 0,
                "visitor_to_chat_conversion_percent": round(
                    chat_users / visitors * 100, 2
                ) if visitors else 0,
            },
            "gemini_usage": {
                "today_attempts": attempts,
                "app_daily_limit": self.settings.global_rpd_limit,
                "app_daily_remaining": max(
                    0, self.settings.global_rpd_limit - attempts
                ),
                "gemini_daily_limit": self.settings.gemini_rpd_limit,
                "estimated_gemini_remaining": max(
                    0, self.settings.gemini_rpd_limit - attempts
                ),
                "safety_reserve": max(
                    0,
                    self.settings.gemini_rpd_limit
                    - self.settings.global_rpd_limit,
                ),
                "current_rpm": current_rpm,
                "app_rpm_limit": self.settings.global_rpm_limit,
                "app_rpm_remaining": max(
                    0, self.settings.global_rpm_limit - current_rpm
                ),
                "gemini_rpm_limit": self.settings.gemini_rpm_limit,
            },
            "last_7_days": last_7_days,
            "limits": {
                "session_limit_reached": session_limited,
                "user_rate_limited": user_limited,
                "global_rate_limited": global_limited,
                "daily_limit_reached": daily_limited,
                "duplicate_requests_blocked": duplicates,
            },
            "errors": {
                "gemini_429": gemini_429,
                "gemini_503": gemini_503,
                "gemini_other": gemini_other,
                "redis_errors": redis_errors,
            },
            "performance": {
                "average_response_ms": average_response,
                "latest_response_ms": latest_response,
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
