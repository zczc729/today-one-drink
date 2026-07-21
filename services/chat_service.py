import logging
import random
import time
from typing import Iterator, List, Optional

from models.chat import ChatMessage, ChatRequest
from services.ai.base import AIService
from services.ai.gemini import GeminiService
from services.analytics_service import AnalyticsService
from services.errors import RedisServiceUnavailable, ServiceError
from services.rate_limiter import RateLimiter, RequestLease


logger = logging.getLogger(__name__)
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    global _ai_service

    if _ai_service is None:
        _ai_service = GeminiService()

    return _ai_service


def create_reply(message: str, history: List[ChatMessage]) -> str:
    return get_ai_service().generate_reply(message=message, history=history)


def create_reply_stream(
    message: str,
    history: List[ChatMessage],
) -> Iterator[str]:
    return get_ai_service().generate_reply_stream(
        message=message,
        history=history,
    )


def _gemini_status_code(exc: Exception) -> int:
    for attribute in ("code", "status_code"):
        value = getattr(exc, attribute, None)
        try:
            if value is not None:
                return int(value)
        except (TypeError, ValueError):
            continue
    response = getattr(exc, "response", None)
    try:
        return int(getattr(response, "status_code", 0) or 0)
    except (TypeError, ValueError):
        return 0


class ChatCoordinator:
    def __init__(
        self,
        ai_service: AIService = None,
        rate_limiter: RateLimiter = None,
        analytics: AnalyticsService = None,
        sleep_fn=time.sleep,
        random_uniform=random.uniform,
    ) -> None:
        self.ai_service = ai_service or get_ai_service()
        self.rate_limiter = rate_limiter or RateLimiter()
        self.analytics = analytics or AnalyticsService(
            settings=self.rate_limiter.settings,
            redis=self.rate_limiter.redis,
        )
        self.sleep_fn = sleep_fn
        self.random_uniform = random_uniform

    @staticmethod
    def temporarily_unavailable() -> ServiceError:
        return ServiceError(
            503,
            "GEMINI_TEMPORARILY_UNAVAILABLE",
            "잠깐 연결이 꼬였네. 다시 한번 말해줘.",
            3,
        )

    def _call_gemini(self, request: ChatRequest) -> str:
        started_at = time.perf_counter()
        reply = self.ai_service.generate_reply(
            message=request.message,
            history=request.history,
        )
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        self.analytics.record_success(elapsed_ms)
        return reply

    def handle(self, request: ChatRequest) -> str:
        lease: Optional[RequestLease] = None
        request_id = str(request.request_id)

        try:
            try:
                lease = self.rate_limiter.begin_request(
                    str(request.session_id),
                    request_id,
                )
                self.rate_limiter.reserve_initial_attempt(
                    lease,
                    request_id,
                )
            except ServiceError as exc:
                self.analytics.record_limit(exc.error_code)
                raise

            self.analytics.record_chat_accepted(str(request.session_id))

            try:
                return self._call_gemini(request)
            except Exception as first_error:
                first_status = _gemini_status_code(first_error)
                self.analytics.record_gemini_error(first_status)

                if first_status not in {429, 503}:
                    logger.error(
                        "Gemini request failed (%s, status=%s).",
                        type(first_error).__name__,
                        first_status or "unknown",
                    )
                    raise self.temporarily_unavailable() from first_error

                self.rate_limiter.renew(lease)
                self.sleep_fn(self.random_uniform(1.0, 2.0))

                try:
                    self.rate_limiter.reserve_retry_attempt(request_id)
                except ServiceError as exc:
                    self.analytics.record_limit(exc.error_code)
                    raise

                try:
                    return self._call_gemini(request)
                except Exception as retry_error:
                    retry_status = _gemini_status_code(retry_error)
                    self.analytics.record_gemini_error(retry_status)
                    logger.error(
                        "Gemini retry failed (%s, status=%s).",
                        type(retry_error).__name__,
                        retry_status or "unknown",
                    )
                    raise self.temporarily_unavailable() from retry_error
        except RedisServiceUnavailable as exc:
            raise RateLimiter.unavailable_error() from exc
        finally:
            if lease is not None:
                self.rate_limiter.release(lease)
