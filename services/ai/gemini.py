import os
from typing import Iterator, List

from dotenv import load_dotenv
from google import genai
from google.genai import types

from models.chat import ChatMessage
from prompts import build_system_prompt
from services.ai.base import AIService


load_dotenv()


SYSTEM_PROMPT = build_system_prompt(
    scene="home_beer",
    persona="close_friend",
)


class GeminiService(AIService):
    def __init__(self) -> None:
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY가 설정되지 않았습니다. "
                ".env 파일을 확인해 주세요."
            )

        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=int(
                    os.getenv(
                        "GEMINI_REQUEST_TIMEOUT_MS",
                        "25000",
                    )
                ),
                # The application owns retry reservations. The SDK must make
                # exactly one HTTP attempt per reserved call.
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        self.model = "gemini-3.1-flash-lite"

    def _build_contents(
        self,
        message: str,
        history: List[ChatMessage],
    ) -> List[types.Content]:
        contents = []

        # Four recent user/assistant pairs are enough for conversational
        # continuity without sending the full browser history indefinitely.
        for item in history[-8:]:
            gemini_role = (
                "model"
                if item.role == "assistant"
                else "user"
            )

            contents.append(
                types.Content(
                    role=gemini_role,
                    parts=[
                        types.Part(text=item.content)
                    ],
                )
            )

        contents.append(
            types.Content(
                role="user",
                parts=[
                    types.Part(text=message.strip())
                ],
            )
        )

        return contents

    @staticmethod
    def _extract_text(response) -> str:
        text_parts = []

        if not response.candidates:
            return ""

        for candidate in response.candidates:
            if not candidate.content:
                continue

            if not candidate.content.parts:
                continue

            for part in candidate.content.parts:
                if part.text:
                    text_parts.append(part.text)

        return "".join(text_parts).strip()

    def generate_reply(
        self,
        message: str,
        history: List[ChatMessage],
    ) -> str:
        cleaned_message = message.strip()

        if not cleaned_message:
            return "무슨 말이든 괜찮아. 천천히 얘기해."

        response = self.client.models.generate_content(
            model=self.model,
            contents=self._build_contents(
                message=cleaned_message,
                history=history,
            ),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.8,
                max_output_tokens=150,
            ),
        )

        reply = self._extract_text(response)

        if not reply:
            return "그 얘기 조금만 더 해줄래?"

        return reply

    def generate_reply_stream(
        self,
        message: str,
        history: List[ChatMessage],
    ) -> Iterator[str]:
        cleaned_message = message.strip()

        if not cleaned_message:
            yield "무슨 말이든 괜찮아. 천천히 얘기해."
            return

        stream = self.client.models.generate_content_stream(
            model=self.model,
            contents=self._build_contents(
                message=cleaned_message,
                history=history,
            ),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.8,
                max_output_tokens=150,
            ),
        )

        has_text = False

        for chunk in stream:
            chunk_text = self._extract_text(chunk)

            if not chunk_text:
                continue

            has_text = True
            yield chunk_text

        if not has_text:
            yield "그 얘기 조금만 더 해줄래?"
