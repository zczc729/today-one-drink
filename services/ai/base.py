from abc import ABC, abstractmethod
from typing import Iterator, List

from models.chat import ChatMessage


class AIService(ABC):
    @abstractmethod
    def generate_reply(
        self,
        message: str,
        history: List[ChatMessage],
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_reply_stream(
        self,
        message: str,
        history: List[ChatMessage],
    ) -> Iterator[str]:
        raise NotImplementedError