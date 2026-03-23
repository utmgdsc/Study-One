"""
Supabase JWT authentication for FastAPI.

Provides two dependencies:
  require_user  – 401 if no valid token (use for protected routes)
  optional_user – returns None when unauthenticated (use during migration)
"""

from __future__ import annotations
import json
from jwt import PyJWK
import sys

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
    # Allow test override
    test_key = getattr(sys.modules[__name__], "_TEST_PUBLIC_KEY", None)
    if test_key:
        return jwt.decode(
            token,
            test_key,
            algorithms=["ES256"],
            audience="authenticated",
            options={"verify_iss": False},
        )

    public_key_str = settings.SUPABASE_JWT_PUBLIC_KEY
    if not public_key_str:
        raise HTTPException(
            status_code=503,
            detail="Auth is not configured (SUPABASE_JWT_PUBLIC_KEY missing).",
        )

    issuer = _expected_issuer()
    decode_kwargs: dict = {"audience": "authenticated", "algorithms": ["ES256"]}
    if issuer:
        decode_kwargs["issuer"] = issuer
    else:
        decode_kwargs["options"] = {"verify_iss": False}

    try:
        jwk = PyJWK(json.loads(public_key_str))
        return jwt.decode(token, jwk.key, **decode_kwargs)
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
    """FastAPI dependency — returns None when no token or invalid token."""
    if credentials is None:
        return None
    try:
        payload = _decode_token(credentials.credentials)
    except HTTPException:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return {
        "user_id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
    }


async def user_for_generate(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserPayload | None:
    """
    Use for generate endpoints: when REQUIRE_AUTH_FOR_GENERATE is False, returns None when no token or invalid token.
    When True, requires valid token (401 if missing/invalid). If token is sent but invalid, we return None so generation still succeeds.
    """
    if credentials is None:
        if settings.REQUIRE_AUTH_FOR_GENERATE:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        return None
    try:
        payload = _decode_token(credentials.credentials)
    except HTTPException:
        if settings.REQUIRE_AUTH_FOR_GENERATE:
            raise
        logger.warning("Generate endpoint: invalid token, proceeding without user")
        return None
    user_id = payload.get("sub")
    if not user_id:
        if settings.REQUIRE_AUTH_FOR_GENERATE:
            raise HTTPException(status_code=401, detail="Token missing subject claim")
        return None
    return {
        "user_id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
    }
