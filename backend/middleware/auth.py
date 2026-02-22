"""
Supabase JWT authentication for FastAPI.

Provides two dependencies:
  require_user  – 401 if no valid token (use for protected routes)
  optional_user – returns None when unauthenticated (use during migration)
"""

from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import jwt

from config import settings

_bearer = HTTPBearer(auto_error=False)

# Minimal user dict returned by the dependencies.
# Extend as needed (email, role, app_metadata, etc.).
UserPayload = dict  # {"user_id": str, "email": str | None, "role": str | None}


def _decode_token(token: str) -> dict:
    """Verify and decode a Supabase-issued JWT."""
    secret = settings.SUPABASE_JWT_SECRET
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Auth is not configured (SUPABASE_JWT_SECRET missing).",
        )
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserPayload:
    """FastAPI dependency — rejects unauthenticated requests with 401."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim")
    return {
        "user_id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
    }


async def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserPayload | None:
    """FastAPI dependency — returns None when no token is present."""
    if credentials is None:
        return None
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        return None
    return {
        "user_id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
    }
