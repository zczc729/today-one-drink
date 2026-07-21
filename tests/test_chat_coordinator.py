from types import SimpleNamespace
from uuid import uuid4

import pytest

from models.chat import ChatMessage, ChatRequest
from services.ai.gemini import GeminiService
from services.chat_service import ChatCoordinator
from services.errors import RedisServiceUnavailable, ServiceError


class FakeAI:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def generate_reply(self, message, history):
        outcome = self.outcomes[self.calls]
        self.calls += 1
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class FakeAnalytics:
    def __init__(self):
        self.accepted = 0
        self.successes = []
        self.errors = []
        self.limits = []

    def record_chat_accepted(self, session_id):
        self.accepted += 1

    def record_success(self, elapsed):
        self.successes.append(elapsed)

    def record_gemini_error(self, status):
        self.errors.append(status)

    def record_limit(self, code):
        self.limits.append(code)


class FakeLimiter:
    def __init__(self, retry_error=None, begin_error=None):
        self.settings = SimpleNamespace()
        self.redis = object()
        self.retry_error = retry_error
        self.begin_error = begin_error
        self.initial_reservations = 0
        self.retry_reservations = 0
        self.releases = 0
        self.renewals = 0

    def begin_request(self, session_id, request_id):
        if self.begin_error:
            raise self.begin_error
        return SimpleNamespace(lock_key="lock", lock_token="token")

    def reserve_initial_attempt(self, lease, request_id):
        self.initial_reservations += 1

    def reserve_retry_attempt(self, request_id):
        self.retry_reservations += 1
        if self.retry_error:
            raise self.retry_error

    def renew(self, lease):
        self.renewals += 1

    def release(self, lease):
        self.releases += 1


class GeminiError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(f"status {code}")


def chat_request():
    return ChatRequest(
        session_id=uuid4(),
        request_id=uuid4(),
        message="오늘 힘들었어",
        history=[],
    )


def test_normal_chat_runs_one_gemini_attempt():
    ai = FakeAI(["진짜 고생했네."])
    limiter = FakeLimiter()
    analytics = FakeAnalytics()
    coordinator = ChatCoordinator(
        ai,
        limiter,
        analytics,
        sleep_fn=lambda _: None,
    )
    assert coordinator.handle(chat_request()) == "진짜 고생했네."
    assert ai.calls == 1
    assert limiter.initial_reservations == 1
    assert limiter.retry_reservations == 0
    assert limiter.releases == 1
    assert analytics.accepted == 1


@pytest.mark.parametrize("status", [429, 503])
def test_temporary_gemini_error_retries_once(status):
    ai = FakeAI([GeminiError(status), "다시 연결됐어."])
    limiter = FakeLimiter()
    analytics = FakeAnalytics()
    sleeps = []
    coordinator = ChatCoordinator(
        ai,
        limiter,
        analytics,
        sleep_fn=sleeps.append,
        random_uniform=lambda low, high: 1.5,
    )
    assert coordinator.handle(chat_request()) == "다시 연결됐어."
    assert ai.calls == 2
    assert limiter.retry_reservations == 1
    assert limiter.renewals == 1
    assert sleeps == [1.5]
    assert analytics.errors == [status]


def test_retry_rechecks_limits_before_second_gemini_call():
    application_limit = ServiceError(
        429,
        "GLOBAL_RATE_LIMITED",
        "busy",
        5,
    )
    ai = FakeAI([GeminiError(429), "must-not-run"])
    limiter = FakeLimiter(retry_error=application_limit)
    analytics = FakeAnalytics()
    coordinator = ChatCoordinator(
        ai,
        limiter,
        analytics,
        sleep_fn=lambda _: None,
    )
    with pytest.raises(ServiceError) as caught:
        coordinator.handle(chat_request())
    assert caught.value.error_code == "GLOBAL_RATE_LIMITED"
    assert ai.calls == 1
    assert limiter.retry_reservations == 1


def test_second_temporary_failure_returns_common_error():
    ai = FakeAI([GeminiError(503), GeminiError(503)])
    coordinator = ChatCoordinator(
        ai,
        FakeLimiter(),
        FakeAnalytics(),
        sleep_fn=lambda _: None,
    )
    with pytest.raises(ServiceError) as caught:
        coordinator.handle(chat_request())
    assert caught.value.error_code == "GEMINI_TEMPORARILY_UNAVAILABLE"
    assert caught.value.retry_after == 3
    assert ai.calls == 2


def test_redis_failure_never_calls_gemini():
    ai = FakeAI(["must-not-run"])
    limiter = FakeLimiter(begin_error=RedisServiceUnavailable("offline"))
    coordinator = ChatCoordinator(ai, limiter, FakeAnalytics())
    with pytest.raises(ServiceError) as caught:
        coordinator.handle(chat_request())
    assert caught.value.error_code == "RATE_LIMIT_SERVICE_UNAVAILABLE"
    assert ai.calls == 0


def test_gemini_history_is_limited_to_four_pairs():
    service = GeminiService.__new__(GeminiService)
    history = [
        ChatMessage(
            role="user" if index % 2 == 0 else "assistant",
            content=f"message-{index}",
        )
        for index in range(12)
    ]
    contents = service._build_contents("지금 메시지", history)
    assert len(contents) == 9
    assert contents[0].parts[0].text == "message-4"
    assert contents[-1].parts[0].text == "지금 메시지"
