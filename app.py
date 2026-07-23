from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from routes.admin import router as admin_router
from routes.chat import router as chat_router
from routes.session import router as session_router


BASE_DIR = Path(__file__).resolve().parent
VERSIONED_STATIC_EXTENSIONS = frozenset({".css", ".js"})
HTML_CACHE_CONTROL = "no-cache, max-age=0, must-revalidate"
VERSIONED_STATIC_CACHE_CONTROL = (
    "public, max-age=31536000, immutable"
)
STATIC_ERROR_CACHE_CONTROL = "no-store"

app = FastAPI(
    title="오늘 한잔 API",
    version="0.1.0",
)

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static",
)

templates = Jinja2Templates(
    directory=BASE_DIR / "templates"
)

app.include_router(chat_router)
app.include_router(session_router)
app.include_router(admin_router)


@app.middleware("http")
async def set_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path

    if path == "/admin" or path.startswith("/api/admin/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    elif path == "/":
        response.headers["Cache-Control"] = HTML_CACHE_CONTROL
    elif path.startswith("/static/"):
        extension = Path(path).suffix.lower()
        is_versioned_asset = request.query_params.get("v")

        response.headers["X-Content-Type-Options"] = "nosniff"
        if response.status_code != 200:
            response.headers["Cache-Control"] = STATIC_ERROR_CACHE_CONTROL
        elif (
            extension in VERSIONED_STATIC_EXTENSIONS
            and is_versioned_asset
        ):
            response.headers["Cache-Control"] = (
                VERSIONED_STATIC_CACHE_CONTROL
            )
        else:
            response.headers["Cache-Control"] = HTML_CACHE_CONTROL
    return response


@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
    )


@app.get("/admin", include_in_schema=False)
async def admin_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
    )


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "message": "FastAPI 서버가 정상 작동 중입니다.",
    }
