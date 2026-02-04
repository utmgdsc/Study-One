import os
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv


# Load .env from the Study-One root (2 levels up from services/)
# backend/services/gemini.py -> backend/ -> Study-One/
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / ".env")

# Validate API key at startup (fail fast)
_api_key = os.getenv("GEMINI_API_KEY")
if not _api_key:
    raise EnvironmentError(
        "GEMINI_API_KEY not found. Please set it in your .env file at the project root."
    )

# Configure Gemini with API key
genai.configure(api_key=_api_key)


class GeminiService:
    """Service for interacting with Google's Gemini AI."""

    def __init__(self, model_name: str = "gemini-2.0-flash"):
        """
        Initialize the Gemini service.

        Args:
            model_name: The Gemini model to use (default: gemini-2.0-flash)
        """
        self.model = genai.GenerativeModel(model_name)

    async def call_gemini(self, prompt: str) -> str | None:
        """
        Send a prompt to Gemini and return the response.

        Args:
            prompt: The text prompt to send to Gemini

        Returns:
            The raw string response from Gemini, or None if an error occurs
        """
        try:
            response = await self.model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            # Log the error but don't crash the server
            print(f"[GeminiService] Error calling Gemini API: {e}")
            return None