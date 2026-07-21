import hashlib
import hmac

from config import get_settings
from services.errors import RedisServiceUnavailable


def hash_identifier(
    value: str,
    purpose: str,
    secret: str = None,
) -> str:
    secret = secret or get_settings().anonymization_secret

    if not secret:
        raise RedisServiceUnavailable(
            "ANONYMIZATION_SECRET is not configured."
        )

    digest = hmac.new(
        secret.encode("utf-8"),
        f"{purpose}:{value}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return digest
