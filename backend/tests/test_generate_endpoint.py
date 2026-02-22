"""
Integration tests for POST /api/v1/generate.

Uses mocked Gemini responses so tests run without API quota.
Covers the same cases as manual short/long notes tests.

Can remove this file after Gemini API key is set up.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

import jwt as pyjwt
from config import settings
from main import app
from main import gemini_service


# Valid JSON response matching the expected format
MOCK_GEMINI_RESPONSE = """{
    "summary": ["Key point 1", "Key point 2", "Key point 3"],
    "quiz": [
        {
            "question": "What is the main topic?",
            "options": ["A", "B", "C", "D"],
            "answer": "A"
        },
        {
            "question": "Which detail is correct?",
            "options": ["W", "X", "Y", "Z"],
            "answer": "Y"
        }
    ]
}"""


_token = pyjwt.encode(
    {"sub": "test-user", "email": "t@t.com", "role": "authenticated", "aud": "authenticated"},
    settings.SUPABASE_JWT_SECRET or "test-secret-for-ci",
    algorithm="HS256",
)
AUTH = {"Authorization": f"Bearer {_token}"}


class TestGenerateEndpoint:
    """Integration tests for the generate endpoint."""

    @patch.object(gemini_service, "call_gemini", new_callable=AsyncMock)
    def test_short_notes_returns_valid_json(self, mock_call_gemini):
        """Test short notes produce valid summary and quiz (no real API call)."""
        mock_call_gemini.return_value = MOCK_GEMINI_RESPONSE

        client = TestClient(app)
        response = client.post(
            "/api/v1/generate",
            json={"text": "Photosynthesis converts light into chemical energy."},
            headers=AUTH,
        )

        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "quiz" in data
        assert isinstance(data["summary"], list)
        assert len(data["summary"]) >= 1
        assert isinstance(data["quiz"], list)
        assert len(data["quiz"]) >= 1
        for q in data["quiz"]:
            assert "question" in q
            assert "options" in q
            assert "answer" in q

    @patch.object(gemini_service, "call_gemini", new_callable=AsyncMock)
    def test_longer_notes_returns_valid_json(self, mock_call_gemini):
        """Test longer notes produce valid summary and quiz (no real API call)."""
        mock_call_gemini.return_value = MOCK_GEMINI_RESPONSE

        client = TestClient(app)
        long_text = (
            "The French Revolution (1789-1799) was a period of radical social "
            "and political upheaval in France. Key causes included financial "
            "crisis, inequality, and Enlightenment ideas. Napoleon eventually rose to power."
        )
        response = client.post(
            "/api/v1/generate",
            json={"text": long_text},
            headers=AUTH,
        )

        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "quiz" in data
        assert isinstance(data["summary"], list)
        assert isinstance(data["quiz"], list)

    def test_empty_text_returns_422_with_meaningful_message(self):
        """Errors return meaningful messages."""
        client = TestClient(app)
        response = client.post(
            "/api/v1/generate",
            json={"text": ""},
            headers=AUTH,
        )
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data

    def test_invalid_json_body_returns_422(self):
        """Invalid request body returns 422."""
        client = TestClient(app)
        response = client.post(
            "/api/v1/generate",
            content="not json",
            headers={**AUTH, "Content-Type": "application/json"},
        )
        assert response.status_code == 422

    @patch.object(gemini_service, "call_gemini", new_callable=AsyncMock)
    def test_gemini_failure_returns_500_with_meaningful_message(
        self, mock_call_gemini
    ):
        """When Gemini fails, returns 500 with meaningful message."""
        mock_call_gemini.return_value = None

        client = TestClient(app)
        response = client.post(
            "/api/v1/generate",
            json={"text": "Some notes"},
            headers=AUTH,
        )
        assert response.status_code == 500
        data = response.json()
        assert "detail" in data
        assert "Failed to generate" in data["detail"]

    @patch.object(gemini_service, "call_gemini", new_callable=AsyncMock)
    def test_invalid_gemini_response_returns_500_with_meaningful_message(
        self, mock_call_gemini
    ):
        """When Gemini returns invalid JSON, returns 500 with meaningful message."""
        mock_call_gemini.return_value = "not valid json at all"

        client = TestClient(app)
        response = client.post(
            "/api/v1/generate",
            json={"text": "Some notes"},
            headers=AUTH,
        )
        assert response.status_code == 500
        data = response.json()
        assert "detail" in data
        assert "JSON" in data["detail"] or "format" in data["detail"].lower()
