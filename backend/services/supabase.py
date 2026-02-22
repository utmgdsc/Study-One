"""
Supabase admin client (service-role key) for server-side DB operations.

Usage:
    from services.supabase import get_supabase
    sb = get_supabase()
    sb.table("profiles").select("*").execute()

The client is created lazily so the app can start without Supabase creds
(e.g. CI, unit tests that mock the DB layer).
"""

from __future__ import annotations

from supabase import Client, create_client

from config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return a cached Supabase admin client. Raises if env vars are missing."""
    global _client
    if _client is not None:
        return _client

    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    if not url or not key:
        raise RuntimeError(
            "Supabase is not configured. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env."
        )

    _client = create_client(url, key)
    return _client
