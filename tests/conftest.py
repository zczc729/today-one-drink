from dataclasses import replace

import pytest

from config import get_settings
from tests.fakes import FakeRedis


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def settings():
    return replace(
        get_settings(),
        redis_url="https://example.upstash.io",
        redis_token="test-token",
        anonymization_secret="test-anonymization-secret",
        admin_username="admin",
        admin_password_hash="",
        admin_session_secret="test-admin-session-secret",
        environment="development",
    )
