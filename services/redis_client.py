import logging
from functools import lru_cache
from typing import Any, Callable

from upstash_redis import Redis

from config import get_settings
from services.errors import RedisServiceUnavailable


logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_redis_client() -> Redis:
    settings = get_settings()

    if not settings.redis_url or not settings.redis_token:
        raise RedisServiceUnavailable(
            "Upstash Redis environment variables are not configured."
        )

    return Redis(
        url=settings.redis_url,
        token=settings.redis_token,
    )


def redis_command(command: Callable[..., Any], *args, **kwargs) -> Any:
    try:
        return command(*args, **kwargs)
    except RedisServiceUnavailable:
        raise
    except Exception as exc:
        logger.error(
            "Redis command failed (%s).",
            type(exc).__name__,
        )
        raise RedisServiceUnavailable(
            "Redis request failed."
        ) from exc


def reset_redis_client_cache() -> None:
    get_redis_client.cache_clear()
