"""
Pytest configuration for Socrato backend tests.
This file is used to remove the google-generativeai deprecation warning that does 
not reflect on the quality of our code.

This file is automatically loaded by pytest when running tests from this folder.
"""

import pytest
import warnings

import jwt as pyjwt
from config import settings
from middleware.auth import _expected_issuer


def pytest_configure(config):
    """Configure pytest settings."""
    # Filter out the google-generativeai deprecation warning
    config.addinivalue_line(
        "filterwarnings", "ignore::FutureWarning"
    )

    # Filter out the PytestAssertRewriteWarning for anyio
    warnings.filterwarnings(
        "ignore",
        message="Module already imported so cannot be rewritten.*anyio",
        category=pytest.PytestAssertRewriteWarning,
    )


TEST_USER_ID = "test-user-00000000-0000-0000-0000-000000000000"
TEST_USER_EMAIL = "test@socrato.dev"


def _make_test_token() -> str:
    """Create a valid Supabase-style JWT for tests.

    Requires SUPABASE_JWT_SECRET to be set so the test token is signed
    with the same secret the middleware uses to verify.
    """
    secret = settings.SUPABASE_JWT_SECRET
    if not secret:
        pytest.skip("SUPABASE_JWT_SECRET not set — cannot create test JWT")

    payload: dict = {
        "sub": TEST_USER_ID,
        "email": TEST_USER_EMAIL,
        "role": "authenticated",
        "aud": "authenticated",
    }
    issuer = _expected_issuer()
    if issuer:
        payload["iss"] = issuer

    return pyjwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture()
def auth_headers() -> dict[str, str]:
    """Authorization header with a valid test JWT."""
    return {"Authorization": f"Bearer {_make_test_token()}"}
