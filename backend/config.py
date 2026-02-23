"""
Centralized configuration loaded once at startup.

Reads from the project-root .env first, then backend/.env (overrides).
Missing Supabase vars are allowed so CI / unit-test runs still start.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "backend" / ".env", override=True)


class _Settings:
    @property
    def GEMINI_API_KEY(self) -> str:
        return os.getenv("GEMINI_API_KEY", "")

    @property
    def SUPABASE_URL(self) -> str:
        return os.getenv("SUPABASE_URL", "")

    @property
    def SUPABASE_SERVICE_ROLE_KEY(self) -> str:
        return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    @property
    def SUPABASE_JWT_SECRET(self) -> str:
        return os.getenv("SUPABASE_JWT_SECRET", "")

    @property
    def REQUIRE_AUTH_FOR_GENERATE(self) -> bool:
        """When True, /api/v1/generate and /generate-study-pack require Authorization. When False, anyone can call them."""
        v = os.getenv("REQUIRE_AUTH_FOR_GENERATE", "false").lower()
        return v in ("true", "1", "yes")


settings = _Settings()
