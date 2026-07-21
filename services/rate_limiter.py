import time
import uuid
from dataclasses import dataclass

from config import Settings, get_settings
from services.errors import RedisServiceUnavailable, ServiceError
from services.privacy import hash_identifier
from services.redis_client import get_redis_client, redis_command
from services.time_utils import now_pacific, seconds_until_after_midnight


PREFIX = "today-one-drink"
WINDOW_MS = 60_000
WINDOW_TTL_SECONDS = 120
SESSION_TTL_SECONDS = 86_400


INITIAL_RESERVATION_SCRIPT = r"""
-- tod_chat_reserve_v1
local now_ms = tonumber(ARGV[1])
local member = ARGV[2]
local window_ms = tonumber(ARGV[3])
local user_limit = tonumber(ARGV[4])
local global_limit = tonumber(ARGV[5])
local daily_limit = tonumber(ARGV[6])
local session_limit = tonumber(ARGV[7])
local window_ttl = tonumber(ARGV[8])
local daily_ttl = tonumber(ARGV[9])
local session_ttl = tonumber(ARGV[10])
local cutoff = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)

local session_count = tonumber(redis.call('GET', KEYS[4]) or '0')
if session_count >= session_limit then
    return {1, 0, session_count}
end

local user_count = tonumber(redis.call('ZCARD', KEYS[1]))
if user_count >= user_limit then
    local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    local retry_ms = math.max(1000, tonumber(first[2]) + window_ms - now_ms)
    return {2, math.ceil(retry_ms / 1000), user_count}
end

local global_count = tonumber(redis.call('ZCARD', KEYS[2]))
if global_count >= global_limit then
    local first = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
    local retry_ms = math.max(1000, tonumber(first[2]) + window_ms - now_ms)
    return {3, math.ceil(retry_ms / 1000), global_count}
end

local daily_count = tonumber(redis.call('GET', KEYS[3]) or '0')
if daily_count >= daily_limit then
    return {4, 0, daily_count}
end

redis.call('ZADD', KEYS[1], now_ms, member)
redis.call('EXPIRE', KEYS[1], window_ttl)
redis.call('ZADD', KEYS[2], now_ms, member)
redis.call('EXPIRE', KEYS[2], window_ttl)
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], daily_ttl)
redis.call('INCR', KEYS[4])
redis.call('EXPIRE', KEYS[4], session_ttl)

return {0, 0, daily_count + 1}
"""


RETRY_RESERVATION_SCRIPT = r"""
-- tod_retry_reserve_v1
local now_ms = tonumber(ARGV[1])
local member = ARGV[2]
local window_ms = tonumber(ARGV[3])
local global_limit = tonumber(ARGV[4])
local daily_limit = tonumber(ARGV[5])
local window_ttl = tonumber(ARGV[6])
local daily_ttl = tonumber(ARGV[7])
local cutoff = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local global_count = tonumber(redis.call('ZCARD', KEYS[1]))
if global_count >= global_limit then
    local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    local retry_ms = math.max(1000, tonumber(first[2]) + window_ms - now_ms)
    return {3, math.ceil(retry_ms / 1000), global_count}
end

local daily_count = tonumber(redis.call('GET', KEYS[2]) or '0')
if daily_count >= daily_limit then
    return {4, 0, daily_count}
end

redis.call('ZADD', KEYS[1], now_ms, member)
redis.call('EXPIRE', KEYS[1], window_ttl)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], daily_ttl)
return {0, 0, daily_count + 1}
"""


COMPARE_DELETE_SCRIPT = r"""
-- tod_compare_delete_v1
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""


COMPARE_EXPIRE_SCRIPT = r"""
-- tod_compare_expire_v1
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
"""


@dataclass(frozen=True)
class RequestLease:
    hashed_session_id: str
    lock_key: str
    lock_token: str


class RateLimiter:
    def __init__(self, settings: Settings = None, redis=None) -> None:
        self.settings = settings or get_settings()
        self.redis = redis or get_redis_client()

    @staticmethod
    def _service_error(code: int, retry_after: int = 0) -> ServiceError:
        if code == 1:
            return ServiceError(
                429,
                "SESSION_LIMIT_REACHED",
                "오늘은 여기까지 한잔하자. 다음에 다시 만나.",
                None,
            )
        if code == 2:
            return ServiceError(
                429,
                "USER_RATE_LIMITED",
                "조금 천천히 말해줘. 잠시 후 다시 보내줘.",
                max(1, retry_after),
            )
        if code == 3:
            return ServiceError(
                429,
                "GLOBAL_RATE_LIMITED",
                "지금 친구들이 한꺼번에 말 걸고 있어. 잠깐 후 다시 말해줘.",
                max(1, retry_after),
            )
        return ServiceError(
            429,
            "DAILY_LIMIT_REACHED",
            "오늘은 친구들이 너무 많이 찾아왔네. 다음에 다시 한잔하자.",
            None,
        )

    @staticmethod
    def unavailable_error() -> ServiceError:
        return ServiceError(
            503,
            "RATE_LIMIT_SERVICE_UNAVAILABLE",
            "잠깐 연결이 꼬였어. 조금 뒤에 다시 말해줘.",
            10,
        )

    def begin_request(self, session_id: str, request_id: str) -> RequestLease:
        hashed_session_id = hash_identifier(
            session_id,
            "chat-session",
            self.settings.anonymization_secret,
        )
        duplicate_key = f"{PREFIX}:request:{request_id}"
        lock_key = f"{PREFIX}:lock:{hashed_session_id}"
        lock_token = uuid.uuid4().hex

        registered = redis_command(
            self.redis.set,
            duplicate_key,
            "1",
            nx=True,
            ex=self.settings.duplicate_request_ttl_seconds,
        )
        if not registered:
            raise ServiceError(
                409,
                "DUPLICATE_REQUEST",
                "이미 처리 중이거나 처리된 요청입니다.",
                None,
            )

        acquired = redis_command(
            self.redis.set,
            lock_key,
            lock_token,
            nx=True,
            ex=self.settings.request_lock_ttl_seconds,
        )
        if not acquired:
            raise ServiceError(
                429,
                "REQUEST_IN_PROGRESS",
                "아직 대답하고 있어. 잠깐만 기다려줘.",
                2,
            )

        return RequestLease(
            hashed_session_id=hashed_session_id,
            lock_key=lock_key,
            lock_token=lock_token,
        )

    def reserve_initial_attempt(
        self,
        lease: RequestLease,
        request_id: str,
        now_ms: int = None,
    ) -> None:
        current_ms = now_ms or int(time.time() * 1000)
        pacific_now = now_pacific()
        daily_key = f"{PREFIX}:quota:gemini:{pacific_now.date().isoformat()}"
        member = f"{request_id}:1:{uuid.uuid4().hex}"
        keys = [
            f"{PREFIX}:rate:user:{lease.hashed_session_id}:sliding-window",
            f"{PREFIX}:rate:global:sliding-window",
            daily_key,
            f"{PREFIX}:session:{lease.hashed_session_id}:count",
        ]
        args = [
            str(current_ms),
            member,
            str(WINDOW_MS),
            str(self.settings.user_rpm_limit),
            str(self.settings.global_rpm_limit),
            str(self.settings.global_rpd_limit),
            str(self.settings.session_request_limit),
            str(WINDOW_TTL_SECONDS),
            str(seconds_until_after_midnight(pacific_now, 2)),
            str(SESSION_TTL_SECONDS),
        ]
        result = redis_command(
            self.redis.eval,
            INITIAL_RESERVATION_SCRIPT,
            keys=keys,
            args=args,
        )
        code = int(result[0])

        if code:
            raise self._service_error(code, int(result[1]))

    def reserve_retry_attempt(
        self,
        request_id: str,
        now_ms: int = None,
    ) -> None:
        current_ms = now_ms or int(time.time() * 1000)
        pacific_now = now_pacific()
        daily_key = f"{PREFIX}:quota:gemini:{pacific_now.date().isoformat()}"
        keys = [
            f"{PREFIX}:rate:global:sliding-window",
            daily_key,
        ]
        args = [
            str(current_ms),
            f"{request_id}:retry:{uuid.uuid4().hex}",
            str(WINDOW_MS),
            str(self.settings.global_rpm_limit),
            str(self.settings.global_rpd_limit),
            str(WINDOW_TTL_SECONDS),
            str(seconds_until_after_midnight(pacific_now, 2)),
        ]
        result = redis_command(
            self.redis.eval,
            RETRY_RESERVATION_SCRIPT,
            keys=keys,
            args=args,
        )
        code = int(result[0])

        if code:
            raise self._service_error(code, int(result[1]))

    def release(self, lease: RequestLease) -> None:
        try:
            redis_command(
                self.redis.eval,
                COMPARE_DELETE_SCRIPT,
                keys=[lease.lock_key],
                args=[lease.lock_token],
            )
        except RedisServiceUnavailable:
            # The lock has a TTL, so a failed cleanup cannot persist forever.
            return

    def renew(self, lease: RequestLease) -> None:
        renewed = redis_command(
            self.redis.eval,
            COMPARE_EXPIRE_SCRIPT,
            keys=[lease.lock_key],
            args=[
                lease.lock_token,
                str(self.settings.request_lock_ttl_seconds),
            ],
        )
        if not int(renewed or 0):
            # Never retry Gemini after exclusivity has been lost.
            raise RedisServiceUnavailable("Request lock ownership was lost.")

    def current_global_rpm(self, now_ms: int = None) -> int:
        current_ms = now_ms or int(time.time() * 1000)
        key = f"{PREFIX}:rate:global:sliding-window"
        count = redis_command(
            self.redis.zcount,
            key,
            current_ms - WINDOW_MS + 1,
            "+inf",
        )
        return max(0, int(count or 0))
