"""
Supabase JWT authentication for FastAPI.

Provides two dependencies:
  require_user  – 401 if no valid token (use for protected routes)
  optional_user – returns None when unauthenticated (use during migration)
"""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import jwt

from config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

UserPayload = dict  # {"user_id": str, "email": str | None, "role": str | None}


def _expected_issuer() -> str | None:
    """Derive the expected JWT issuer from SUPABASE_URL."""
    url = settings.SUPABASE_URL
    if not url:
        return None
    return f"{url.rstrip('/')}/auth/v1"


def _decode_token(token: str) -> dict:
    """Verify and decode a Supabase-issued JWT."""
    secret = settings.SUPABASE_JWT_SECRET
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Auth is not configured (SUPABASE_JWT_SECRET missing).",
        )

    issuer = _expected_issuer()
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=issuer,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Token issuer is not trusted")
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
