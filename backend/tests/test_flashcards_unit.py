"""
Unit tests for Flashcard Generation Endpoint.

================================================================================
⚠️  API KEY CONSUMPTION WARNING
================================================================================

These unit tests use MOCKS and do NOT consume API quota.

To avoid accidental quota usage:
    - Run unit tests (this file) for regular development
    - Only use curl when you need to verify the real Gemini response

================================================================================
HOW TO RUN TESTS
================================================================================

IMPORTANT: You must be in the backend/ directory to run these tests.

    cd backend
    source venv/bin/activate  # macOS/Linux

    # Install dependencies
    pip install -r requirements.txt

    # Run unit tests (no API calls)
    pytest tests/test_flashcards_unit.py -v

================================================================================
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
import json
from unittest.mock import AsyncMock, patch

from main import app, FlashcardRequest, Flashcard, parse_and_validate_flashcards, clean_response
from services.gemini import GeminiService
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Test client
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Mock data
# ---------------------------------------------------------------------------

VALID_NOTES = """
Photosynthesis:
- Plants convert light energy into chemical energy stored as glucose
- Chlorophyll absorbs sunlight and is found in chloroplasts
- The process produces oxygen as a by-product
- Carbon dioxide and water are the raw materials
- Light-dependent and light-independent reactions are the two stages
"""

VALID_TOPIC = "The water cycle"


def _make_flashcard_payload(n: int = 10) -> list:
    """Return a list of n valid flashcard dicts."""
    return [
        {
            "question": f"Sample question {i + 1}?",
            "answer": f"Sample answer {i + 1}.",
        }
        for i in range(n)
    ]


MOCK_GEMINI_RESPONSE = json.dumps({
    "flashcards": [
        {"question": f"What is concept {i + 1}?", "answer": f"Concept {i + 1} explanation."}
        for i in range(10)
    ]
})

MOCK_GEMINI_RESPONSE_WITH_MARKDOWN = f"```json\n{MOCK_GEMINI_RESPONSE}\n```"
MOCK_GEMINI_RESPONSE_WITH_GENERIC_FENCE = f"```\n{MOCK_GEMINI_RESPONSE}\n```"


# ---------------------------------------------------------------------------
# TestFlashcardRequest — Pydantic model validation
# ---------------------------------------------------------------------------

class TestFlashcardRequest:
    """Test suite for FlashcardRequest input validation"""

    def test_valid_request_with_text(self):
        """Test creating a valid request with text"""
        request = FlashcardRequest(text="These are my study notes about photosynthesis")
        assert request.text == "These are my study notes about photosynthesis"

    def test_valid_request_with_topic(self):
        """Test creating a valid request with topic"""
        request = FlashcardRequest(topic="Photosynthesis")
        assert request.topic == "Photosynthesis"

    def test_default_difficulty_is_medium(self):
        """Test that difficulty defaults to medium"""
        request = FlashcardRequest(text="Some notes here")
        assert request.difficulty.value == "medium"

    def test_accepts_easy_difficulty(self):
        request = FlashcardRequest(text="Some notes here", difficulty="easy")
        assert request.difficulty.value == "easy"

    def test_accepts_hard_difficulty(self):
        request = FlashcardRequest(text="Some notes here", difficulty="hard")
        assert request.difficulty.value == "hard"

    def test_rejects_invalid_difficulty(self):
        """Test that invalid difficulty raises a validation error"""
        with pytest.raises(Exception):
            FlashcardRequest(text="Some notes", difficulty="extreme")

    def test_rejects_missing_text_and_topic(self):
        """Test that providing neither text nor topic raises an error"""
        with pytest.raises(Exception):
            FlashcardRequest()

    def test_strips_whitespace_from_text(self):
        """Test that leading/trailing whitespace is stripped from text"""
        request = FlashcardRequest(text="  some notes  ")
        assert request.text == "some notes"

    def test_strips_whitespace_from_topic(self):
        request = FlashcardRequest(topic="  water cycle  ")
        assert request.topic == "water cycle"


# ---------------------------------------------------------------------------
# TestFlashcardStructure — response shape
# ---------------------------------------------------------------------------

class TestFlashcardStructure:
    """Test suite verifying each flashcard is correctly structured"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_response_contains_flashcards_array(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "flashcards" in data
        assert isinstance(data["flashcards"], list)

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_response_contains_exactly_10_flashcards(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert len(response.json()["flashcards"]) == 10

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_each_flashcard_has_question_and_answer(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for card in response.json()["flashcards"]:
            assert "question" in card
            assert "answer" in card

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_question_and_answer_are_strings(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for card in response.json()["flashcards"]:
            assert isinstance(card["question"], str)
            assert isinstance(card["answer"], str)

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_accepts_topic_instead_of_text(self, mock_gemini, client, auth_headers):
        """Test that topic input works as an alternative to notes"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"topic": VALID_TOPIC},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert len(response.json()["flashcards"]) == 10


# ---------------------------------------------------------------------------
# TestJSONValidation — malformed Gemini responses
# ---------------------------------------------------------------------------

class TestJSONValidation:
    """Test suite verifying JSON structure and field-level checks"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_flashcards_key(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = json.dumps({"data": []})

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "flashcards" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_fewer_than_10_flashcards(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = json.dumps({"flashcards": _make_flashcard_payload(5)})

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "10" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_more_than_10_flashcards(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = json.dumps({"flashcards": _make_flashcard_payload(12)})

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "10" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_question_field(self, mock_gemini, client, auth_headers):
        bad = {"flashcards": [{"answer": "Some answer"} for _ in range(10)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "question" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_answer_field(self, mock_gemini, client, auth_headers):
        bad = {"flashcards": [{"question": "Some question?"} for _ in range(10)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "answer" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_empty_question_rejected(self, mock_gemini, client, auth_headers):
        bad = {"flashcards": [{"question": "  ", "answer": "Some answer"} for _ in range(10)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "question" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_empty_answer_rejected(self, mock_gemini, client, auth_headers):
        bad = {"flashcards": [{"question": "Some question?", "answer": "  "} for _ in range(10)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "answer" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_flashcard_item_not_dict(self, mock_gemini, client, auth_headers):
        bad = {"flashcards": ["not a dict"] * 10}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500


# ---------------------------------------------------------------------------
# TestNoHallucinatedFormatting — markdown stripping
# ---------------------------------------------------------------------------

class TestNoHallucinatedFormatting:
    """Test suite verifying markdown and extra formatting is stripped correctly"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_markdown_json_fence(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE_WITH_MARKDOWN

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert len(response.json()["flashcards"]) == 10

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_generic_code_fence(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE_WITH_GENERIC_FENCE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_whitespace(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = f"\n\n  {MOCK_GEMINI_RESPONSE}  \n"

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_plain_text_response_returns_500(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = "Sure! Here are your flashcards in a nice format."

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_empty_string_returns_500(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = ""

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500

    def test_clean_response_strips_json_fence(self):
        raw = f"```json\n{MOCK_GEMINI_RESPONSE}\n```"
        result = clean_response(raw)
        assert "```" not in result

    def test_clean_response_strips_generic_fence(self):
        raw = f"```\n{MOCK_GEMINI_RESPONSE}\n```"
        result = clean_response(raw)
        assert "```" not in result

    def test_clean_response_leaves_plain_json_unchanged(self):
        result = clean_response(MOCK_GEMINI_RESPONSE)
        assert result == MOCK_GEMINI_RESPONSE.strip()


# ---------------------------------------------------------------------------
# TestGenerateFlashcardsEndpoint — HTTP contract
# ---------------------------------------------------------------------------

class TestGenerateFlashcardsEndpoint:
    """Test suite for POST /api/v1/flashcards HTTP contract"""

    def test_endpoint_exists(self, client, auth_headers):
        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )
        assert response.status_code != 404

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_accepts_text_input(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert mock_gemini.called

    def test_rejects_empty_body(self, client, auth_headers):
        response = client.post(
            "/api/v1/flashcards",
            json={},
            headers=auth_headers,
        )
        assert response.status_code == 422

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_gemini_unavailable(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = None

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "Failed to generate flashcards" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_response_content_type_is_json(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_successful_response_schema(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert list(body.keys()) == ["flashcards"]
        first = body["flashcards"][0]
        assert set(first.keys()) == {"question", "answer"}

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_difficulty_easy_accepted(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES, "difficulty": "easy"},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_difficulty_hard_accepted(self, mock_gemini, client, auth_headers):
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES, "difficulty": "hard"},
            headers=auth_headers,
        )

        assert response.status_code == 200

    def test_invalid_difficulty_rejected(self, client, auth_headers):
        response = client.post(
            "/api/v1/flashcards",
            json={"text": VALID_NOTES, "difficulty": "extreme"},
            headers=auth_headers,
        )
        assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])