from uuid import UUID

from pydantic import BaseModel


class SessionStartRequest(BaseModel):
    session_id: UUID
