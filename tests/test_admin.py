from dataclasses import replace
from pathlib import Path

import bcrypt
import pytest
from fastapi.testclient import TestClient

import routes.admin as admin_routes
from app import app
from services.admin_auth import AdminAuthService
from services.errors import ServiceError


def configured_settings(settings, production=False):
    password_hash = bcrypt.hashpw(
        b"correct horse battery staple",
        bcrypt.gensalt(rounds=4),
    ).decode("utf-8")
    return replace(
        settings,
        admin_password_hash=password_hash,
        environment="production" if production else "development",
    )


def test_bcrypt_credentials_and_signed_session(settings, fake_redis):
    configured = configured_settings(settings)
    auth = AdminAuthService(configured, fake_redis)
    assert auth.verify_credentials(
        "admin", "correct horse battery staple"
    )
    assert not auth.verify_credentials("admin", "wrong")
    token = auth.create_session_token(now=1000)
    assert auth.verify_session_token(token, now=1001)


def test_tampered_and_expired_cookie_are_rejected(settings, fake_redis):
    configured = configured_settings(settings)
    auth = AdminAuthService(configured, fake_redis)
    token = auth.create_session_token(now=1000)
    assert not auth.verify_session_token(token + "x", now=1001)
    assert not auth.verify_session_token(
        token,
        now=1000 + configured.admin_session_max_age_seconds,
    )


def test_login_failure_limit_blocks_sixth_attempt(settings, fake_redis):
    configured = configured_settings(settings)
    auth = AdminAuthService(configured, fake_redis)
    for _ in range(configured.admin_login_max_attempts):
        key = auth.assert_login_allowed("127.0.0.1")
        auth.record_login_failure(key)
    with pytest.raises(ServiceError) as caught:
        auth.assert_login_allowed("127.0.0.1")
    assert caught.value.error_code == "ADMIN_LOGIN_RATE_LIMITED"
    assert caught.value.retry_after > 0


def install_admin_fakes(monkeypatch, settings, fake_redis, production=False):
    configured = configured_settings(settings, production=production)
    auth = AdminAuthService(configured, fake_redis)
    monkeypatch.setattr(admin_routes, "AdminAuthService", lambda: auth)
    monkeypatch.setattr(admin_routes, "get_settings", lambda: configured)

    class Dashboard:
        def dashboard(self):
            return {
                "traffic_timezone": "Asia/Seoul",
                "quota_timezone": "America/Los_Angeles",
                "last_7_days": [],
            }

    monkeypatch.setattr(admin_routes, "AnalyticsService", Dashboard)
    return configured


def test_admin_login_dashboard_and_logout(monkeypatch, settings, fake_redis):
    install_admin_fakes(monkeypatch, settings, fake_redis)
    client = TestClient(app)
    denied = client.get("/api/admin/dashboard")
    assert denied.status_code == 401
    assert denied.headers["cache-control"] == "no-store"

    login = client.post(
        "/api/admin/login",
        json={
            "username": "admin",
            "password": "correct horse battery staple",
        },
    )
    assert login.status_code == 200
    cookie = login.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "secure" not in cookie

    dashboard = client.get("/api/admin/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["traffic_timezone"] == "Asia/Seoul"

    logout = client.post("/api/admin/logout")
    assert logout.status_code == 200
    assert client.get("/api/admin/dashboard").status_code == 401


def test_wrong_login_is_generic(monkeypatch, settings, fake_redis):
    install_admin_fakes(monkeypatch, settings, fake_redis)
    client = TestClient(app)
    response = client.post(
        "/api/admin/login",
        json={"username": "someone", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["message"] == "아이디 또는 비밀번호가 올바르지 않습니다."


def test_production_login_cookie_is_secure(monkeypatch, settings, fake_redis):
    install_admin_fakes(
        monkeypatch,
        settings,
        fake_redis,
        production=True,
    )
    response = TestClient(app).post(
        "/api/admin/login",
        json={
            "username": "admin",
            "password": "correct horse battery staple",
        },
    )
    assert "secure" in response.headers["set-cookie"].lower()


def test_admin_page_is_noindex_and_no_store():
    response = TestClient(app).get("/admin")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert '<meta name="robots" content="noindex, nofollow">' in response.text


def test_invalid_uuid_is_rejected_before_chat_service():
    response = TestClient(app).post(
        "/api/chat",
        json={
            "session_id": "not-a-uuid",
            "request_id": "also-not-a-uuid",
            "message": "hello",
            "history": [],
        },
    )
    assert response.status_code == 422


def test_frontend_files_contain_no_secret_values(settings):
    root = Path(__file__).resolve().parents[1]
    frontend = "\n".join(
        (root / relative).read_text(encoding="utf-8")
        for relative in [
            "templates/admin.html",
            "static/admin.js",
            "static/app.js",
        ]
    )
    assert settings.redis_token not in frontend
    assert settings.admin_session_secret not in frontend
    assert "ADMIN_PASSWORD_HASH" not in frontend
