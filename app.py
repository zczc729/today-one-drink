from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from routes.admin import router as admin_router
from routes.chat import router as chat_router
from routes.session import router as session_router


BASE_DIR = Path(__file__).resolve().parent

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
async def protect_admin_cache(request: Request, call_next):
    response = await call_next(request)
    if (
        request.url.path == "/admin"
        or request.url.path.startswith("/api/admin/")
    ):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
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
