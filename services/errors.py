from dataclasses import dataclass
from typing import Optional


@dataclass
class ServiceError(Exception):
    status_code: int
    error_code: str
    message: str
    retry_after: Optional[int] = None

    def as_dict(self) -> dict:
        return {
            "success": False,
            "error_code": self.error_code,
            "message": self.message,
            "retry_after": self.retry_after,
        }


class RedisServiceUnavailable(RuntimeError):
    pass
