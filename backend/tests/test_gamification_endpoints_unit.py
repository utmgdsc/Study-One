"""
Unit tests for gamification endpoints (quiz result, flashcard session complete).
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}


@pytest.fixture(autouse=True)
def mock_auth():
    """Mock _decode_token so Bearer test-token is accepted as valid."""
    def fake_decode(token: str):
        if token == "test-token":
            return {"sub": "test-user-id", "email": None, "role": None}
        raise Exception("Invalid token")

    with patch("middleware.auth._decode_token", side_effect=fake_decode):
        yield


@pytest.fixture(autouse=True)
def mock_gamification_rpc():
    """Mock Supabase RPC for apply_activity."""
    mock_sb = MagicMock()
    mock_sb.rpc.return_value.execute.return_value.data = {
        "applied": True,
        "xp_awarded": 25,
        "user_stats": {
            "user_id": "test-user-id",
            "xp_total": 25,
            "current_streak_days": 1,
            "longest_streak_days": 1,
        },
    }
    with patch("services.gamification.get_supabase", return_value=mock_sb):
        yield mock_sb


class TestQuizResultEndpoint:
    """Tests for POST /api/v1/quiz/result"""

    def test_quiz_result_requires_auth(self, client):
        response = client.post("/api/v1/quiz/result", json={"correct": 5, "total": 5})
        assert response.status_code == 401

    def test_quiz_result_success(self, client, auth_headers, mock_gamification_rpc):
        mock_gamification_rpc.rpc.return_value.execute.return_value.data = {
            "applied": True,
            "xp_awarded": 40,
            "user_stats": {"xp_total": 40, "current_streak_days": 1, "longest_streak_days": 1},
        }
        response = client.post(
            "/api/v1/quiz/result",
            json={"correct": 5, "total": 5},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["applied"] is True
        assert data["xp_awarded"] == 40
        assert "user_stats" in data

    def test_quiz_result_invalid_correct_rejects(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/result",
            json={"correct": 6, "total": 5},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_quiz_result_invalid_total_rejects(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/result",
            json={"correct": 3, "total": 0},
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestFlashcardSessionCompleteEndpoint:
    """Tests for POST /api/v1/flashcards/session-complete"""

    def test_session_complete_requires_auth(self, client):
        response = client.post(
            "/api/v1/flashcards/session-complete",
            json={"flashcard_set_id": "abc-123"},
        )
        assert response.status_code == 401

    def test_session_complete_success(self, client, auth_headers, mock_gamification_rpc):
        mock_gamification_rpc.rpc.return_value.execute.return_value.data = {
            "applied": True,
            "xp_awarded": 10,
            "user_stats": {"xp_total": 10, "current_streak_days": 1, "longest_streak_days": 1},
        }
        response = client.post(
            "/api/v1/flashcards/session-complete",
            json={"flashcard_set_id": "abc-123"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["applied"] is True
        assert data["xp_awarded"] == 10
        assert "user_stats" in data
