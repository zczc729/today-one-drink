from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from uuid import uuid4

import pytest

from services.errors import RedisServiceUnavailable, ServiceError
from services.rate_limiter import RateLimiter


def perform_request(limiter, session_id, now_ms):
    request_id = str(uuid4())
    lease = limiter.begin_request(session_id, request_id)
    try:
        limiter.reserve_initial_attempt(lease, request_id, now_ms=now_ms)
    finally:
        limiter.release(lease)


def test_normal_request_is_reserved_once(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    perform_request(limiter, str(uuid4()), 1_000_000)
    quota_values = [
        int(value) for key, value in fake_redis.values.items()
        if ":quota:gemini:" in key
    ]
    session_values = [
        int(value) for key, value in fake_redis.values.items()
        if ":session:" in key
    ]
    assert quota_values == [1]
    assert session_values == [1]


def test_duplicate_request_id_is_blocked(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    session_id = str(uuid4())
    request_id = str(uuid4())
    lease = limiter.begin_request(session_id, request_id)
    limiter.release(lease)
    with pytest.raises(ServiceError) as caught:
        limiter.begin_request(session_id, request_id)
    assert caught.value.error_code == "DUPLICATE_REQUEST"


def test_concurrent_request_for_same_session_is_blocked(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    session_id = str(uuid4())
    lease = limiter.begin_request(session_id, str(uuid4()))
    with pytest.raises(ServiceError) as caught:
        limiter.begin_request(session_id, str(uuid4()))
    limiter.release(lease)
    assert caught.value.error_code == "REQUEST_IN_PROGRESS"


def test_user_fourth_request_in_60_seconds_is_blocked(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    session_id = str(uuid4())
    for offset in range(3):
        perform_request(limiter, session_id, 1_000_000 + offset)
    with pytest.raises(ServiceError) as caught:
        perform_request(limiter, session_id, 1_000_100)
    assert caught.value.error_code == "USER_RATE_LIMITED"
    assert caught.value.retry_after > 0


def test_global_thirteenth_request_is_blocked(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    for offset in range(12):
        perform_request(limiter, str(uuid4()), 1_000_000 + offset)
    with pytest.raises(ServiceError) as caught:
        perform_request(limiter, str(uuid4()), 1_000_100)
    assert caught.value.error_code == "GLOBAL_RATE_LIMITED"


def test_session_sixteenth_request_is_blocked(settings, fake_redis):
    relaxed = replace(settings, global_rpd_limit=1000)
    limiter = RateLimiter(relaxed, fake_redis)
    session_id = str(uuid4())
    for offset in range(15):
        perform_request(
            limiter,
            session_id,
            1_000_000 + offset * 61_000,
        )
    with pytest.raises(ServiceError) as caught:
        perform_request(limiter, session_id, 2_000_000)
    assert caught.value.error_code == "SESSION_LIMIT_REACHED"


def test_pacific_daily_401st_attempt_is_blocked(settings, fake_redis):
    relaxed = replace(
        settings,
        global_rpd_limit=400,
        global_rpm_limit=500,
        user_rpm_limit=500,
        session_request_limit=500,
    )
    limiter = RateLimiter(relaxed, fake_redis)
    for offset in range(400):
        perform_request(limiter, str(uuid4()), 1_000_000 + offset)
    with pytest.raises(ServiceError) as caught:
        perform_request(limiter, str(uuid4()), 1_000_500)
    assert caught.value.error_code == "DAILY_LIMIT_REACHED"


def test_retry_counts_as_gemini_attempt_not_session_message(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    session_id = str(uuid4())
    request_id = str(uuid4())
    lease = limiter.begin_request(session_id, request_id)
    limiter.reserve_initial_attempt(lease, request_id, now_ms=1_000_000)
    limiter.reserve_retry_attempt(request_id, now_ms=1_000_001)
    limiter.release(lease)
    quota = next(
        int(value) for key, value in fake_redis.values.items()
        if ":quota:gemini:" in key
    )
    session_count = next(
        int(value) for key, value in fake_redis.values.items()
        if ":session:" in key
    )
    assert quota == 2
    assert session_count == 1


def test_lock_release_only_deletes_its_own_token(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    lease = limiter.begin_request(str(uuid4()), str(uuid4()))
    fake_redis.set(lease.lock_key, "new-owner", xx=True)
    limiter.release(lease)
    assert fake_redis.get(lease.lock_key) == "new-owner"


def test_lock_renewal_requires_matching_owner(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    lease = limiter.begin_request(str(uuid4()), str(uuid4()))
    limiter.renew(lease)
    assert fake_redis.ttl(lease.lock_key) > 0

    fake_redis.set(lease.lock_key, "new-owner", xx=True)
    with pytest.raises(RedisServiceUnavailable):
        limiter.renew(lease)


def test_redis_failure_is_fail_closed(settings):
    class BrokenRedis:
        def set(self, *args, **kwargs):
            raise OSError("offline")

    limiter = RateLimiter(settings, BrokenRedis())
    with pytest.raises(RedisServiceUnavailable):
        limiter.begin_request(str(uuid4()), str(uuid4()))


def test_concurrent_lock_acquisition_has_one_winner(settings, fake_redis):
    limiter = RateLimiter(settings, fake_redis)
    session_id = str(uuid4())

    def attempt(_):
        try:
            lease = limiter.begin_request(session_id, str(uuid4()))
            return lease
        except ServiceError:
            return None

    with ThreadPoolExecutor(max_workers=12) as pool:
        leases = list(pool.map(attempt, range(12)))

    winners = [lease for lease in leases if lease is not None]
    assert len(winners) == 1
    limiter.release(winners[0])


def test_concurrent_global_reservations_never_exceed_limit(settings, fake_redis):
    relaxed = replace(
        settings,
        user_rpm_limit=100,
        session_request_limit=100,
    )
    limiter = RateLimiter(relaxed, fake_redis)

    def attempt(_):
        try:
            perform_request(limiter, str(uuid4()), 1_000_000)
            return True
        except ServiceError as exc:
            assert exc.error_code == "GLOBAL_RATE_LIMITED"
            return False

    with ThreadPoolExecutor(max_workers=20) as pool:
        outcomes = list(pool.map(attempt, range(20)))

    assert sum(outcomes) == settings.global_rpm_limit
