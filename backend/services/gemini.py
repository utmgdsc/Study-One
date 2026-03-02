import os
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv


# Path to .env (Study-One root): backend/services/gemini.py -> backend/ -> Study-One/
ROOT_DIR = Path(__file__).resolve().parent.parent.parent


class GeminiService:
    """Service for interacting with Google's Gemini AI."""

    def __init__(self, model_name: str = "gemini-2.5-flash"):
        """
        Initialize the Gemini service.

        No env loading or API key validation runs here, so the app can start
        without GEMINI_API_KEY (e.g. CI, unit tests). Validation happens
        lazily on first call_gemini().
        """
        self._model_name = model_name
        self._model = None
        self._configured = False

    def _ensure_configured(self) -> bool:
        """
        Load .env and configure Gemini. Call once before first API use.
        Returns False if GEMINI_API_KEY is missing (caller should return None / 500).
        """
        if self._configured:
            return self._model is not None

        self._configured = True
        # Load shared/root env first, then allow backend/.env to override if present.
        load_dotenv(ROOT_DIR / ".env")
        load_dotenv(ROOT_DIR / "backend" / ".env", override=True)  # backend/.env overrides root for backend config
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key or not api_key.strip():
            print("[GeminiService] GEMINI_API_KEY not set. Set it in .env to use Gemini.")
            return False

        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(self._model_name)
        return True

    async def call_gemini(self, prompt: str) -> str | None:
        """
        Send a prompt to Gemini and return the response.

        Args:
            prompt: The text prompt to send to Gemini

        Returns:
            The raw string response from Gemini, or None if an error occurs
            (including missing API key, so the endpoint can return 500/503).
        """
        if not self._ensure_configured():
            return None

        try:
            response = await self._model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            # Log the error but don't crash the server
            print(f"[GeminiService] Error calling Gemini API: {e}")
            return None