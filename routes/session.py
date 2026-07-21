import logging

from fastapi import APIRouter

from models.session import SessionStartRequest
from services.analytics_service import AnalyticsService


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["session"])


@router.post("/session/start")
def start_session(request: SessionStartRequest):
    try:
        AnalyticsService().record_visit(str(request.session_id))
    except Exception as exc:
        # Page analytics is deliberately fail-open and isolated from chat limits.
        logger.warning(
            "Session analytics could not be initialized (%s).",
            type(exc).__name__,
        )
    return {"success": True}
