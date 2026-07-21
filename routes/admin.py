from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from config import get_settings
from models.admin import AdminLoginRequest
from services.admin_auth import (
    ADMIN_COOKIE_NAME,
    AdminAuthService,
    client_identifier_from_request,
)
from services.analytics_service import AnalyticsService
from services.errors import RedisServiceUnavailable, ServiceError


router = APIRouter(prefix="/api/admin", tags=["admin"])


def _response(content: dict, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        content=content,
        status_code=status_code,
        headers={
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )


def _error_response(error: ServiceError) -> JSONResponse:
    return _response(error.as_dict(), error.status_code)


def _authenticated(request: Request, auth: AdminAuthService) -> bool:
    return auth.verify_session_token(
        request.cookies.get(ADMIN_COOKIE_NAME)
    )


@router.post("/login")
def login(request: Request, credentials: AdminLoginRequest):
    try:
        auth = AdminAuthService()
        limit_key = auth.assert_login_allowed(
            client_identifier_from_request(request)
        )
        if not auth.verify_credentials(
            credentials.username,
            credentials.password,
        ):
            auth.record_login_failure(limit_key)
            return _response(
                {
                    "success": False,
                    "message": "아이디 또는 비밀번호가 올바르지 않습니다.",
                },
                401,
            )

        auth.clear_login_failures(limit_key)
        response = _response({"success": True})
        settings = get_settings()
        response.set_cookie(
            key=ADMIN_COOKIE_NAME,
            value=auth.create_session_token(),
            max_age=settings.admin_session_max_age_seconds,
            httponly=True,
            secure=settings.secure_admin_cookie,
            samesite="strict",
            path="/",
        )
        return response
    except ServiceError as exc:
        return _error_response(exc)
    except RedisServiceUnavailable:
        return _error_response(
            ServiceError(
                503,
                "ADMIN_AUTH_SERVICE_UNAVAILABLE",
                "관리자 인증 서비스를 잠시 사용할 수 없습니다.",
                10,
            )
        )


@router.post("/logout")
def logout():
    response = _response({"success": True})
    response.delete_cookie(
        ADMIN_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=get_settings().secure_admin_cookie,
        samesite="strict",
    )
    return response


@router.get("/me")
def me(request: Request):
    try:
        auth = AdminAuthService()
        if not _authenticated(request, auth):
            return _response(
                {"success": False, "message": "인증이 필요합니다."},
                401,
            )
        return _response(
            {
                "success": True,
                "username": get_settings().admin_username,
            }
        )
    except RedisServiceUnavailable:
        return _response(
            {"success": False, "message": "관리자 서비스를 사용할 수 없습니다."},
            503,
        )


@router.get("/dashboard")
def dashboard(request: Request):
    try:
        auth = AdminAuthService()
        if not _authenticated(request, auth):
            return _response(
                {"success": False, "message": "인증이 필요합니다."},
                401,
            )
        return _response(AnalyticsService().dashboard())
    except (RedisServiceUnavailable, ServiceError):
        return _response(
            {
                "success": False,
                "message": "통계 데이터를 불러오지 못했습니다.",
            },
            503,
        )
