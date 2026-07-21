"""Optional manual Gemini smoke test.

This module is safe for pytest collection. Run it explicitly only when one
real Gemini request is intended: ``python test_gemini.py``.
"""
import os

from dotenv import load_dotenv
from google import genai


def main() -> None:
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY가 설정되지 않았습니다.")

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite",
        contents="안녕하세요. 자기소개를 한 문장으로 해주세요.",
    )
    print(response.text)


if __name__ == "__main__":
    main()
