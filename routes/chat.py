import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from models.chat import ChatRequest, ChatResponse
from services.chat_service import ChatCoordinator
from services.errors import ServiceError


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


def _error_response(error: ServiceError) -> JSONResponse:
    headers = {}
    if error.retry_after is not None:
        headers["Retry-After"] = str(error.retry_after)
    return JSONResponse(
        status_code=error.status_code,
        content=error.as_dict(),
        headers=headers,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    try:
        reply = ChatCoordinator().handle(request)
        return ChatResponse(success=True, message=reply)
    except ServiceError as exc:
        return _error_response(exc)
    except Exception as exc:
        logger.error(
            "Unexpected chat error (%s).",
            type(exc).__name__,
        )
        return _error_response(
            ServiceError(
                500,
                "INTERNAL_ERROR",
                "잠깐 문제가 생겼네. 조금 있다가 다시 얘기해줘.",
                None,
            )
        )


@router.post("/chat/stream")
def chat_stream(request: ChatRequest):
    """Compatibility endpoint; limits are resolved before headers are sent."""
    try:
        reply = ChatCoordinator().handle(request)
        return StreamingResponse(
            iter([reply]),
            media_type="text/plain; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except ServiceError as exc:
        return _error_response(exc)
