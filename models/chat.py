from typing import List, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(
        min_length=1,
        max_length=2000,
    )


class ChatRequest(BaseModel):
    session_id: UUID
    request_id: UUID

    message: str = Field(
        min_length=1,
        max_length=1000,
    )

    history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
    )


class ChatResponse(BaseModel):
    success: bool = True
    message: str
