"""
Unit tests for Generating Study Pack.

================================================================================
⚠️  API KEY CONSUMPTION WARNING
================================================================================

These unit tests use MOCKS and do NOT consume API quota.

To avoid accidental quota usage:
    - Run unit tests (this file) for regular development
    - Only run test_study_pack.py when you need to verify the API connection

================================================================================
HOW TO RUN TESTS
================================================================================

IMPORTANT: You must be in the backend/ directory to run these tests.

Start Virtual Environment:

Run all tests:
    pytest tests/test_study_pack_unit.py -v

Run a specific test:
    pytest tests/test_study_pack_unit.py::TestGenerateStudyPackEndpoint::test_endpoint_exists -v

"""

import sys
import os
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch



from main import app, StudyPackRequest, QuizQuestion, clean_response, validate_data
from services.gemini import GeminiService
from fastapi.testclient import TestClient

from pydantic import ValidationError

# Add the parent directory to the path to import main module
# Adjust this path based on your actual directory structure
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


# Test client
@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


# Mock data
VALID_NOTES = """
Machine Learning Basics:
- Supervised learning uses labeled data
- Unsupervised learning finds patterns in unlabeled data
- Neural networks are inspired by biological neurons
"""

MOCK_GEMINI_RESPONSE = json.dumps({
    "summary": [
        "Supervised learning uses labeled training data to learn patterns",
        "Unsupervised learning discovers hidden patterns without labels",
        "Neural networks mimic biological brain structure"
    ],
    "quiz": [
        {
            "question": "What type of learning uses labeled data?",
            "options": ["Supervised learning", "Unsupervised learning", "Reinforcement learning", "Deep learning"],
            "answer": "Supervised learning"
        },
        {
            "question": "What do neural networks mimic?",
            "options": ["Computer circuits", "Biological neurons", "Mathematical formulas", "Database structures"],
            "answer": "Biological neurons"
        },
        {
            "question": "What does unsupervised learning find?",
            "options": ["Labels", "Patterns in unlabeled data", "Errors", "Classifications"],
            "answer": "Patterns in unlabeled data"
        }
    ]
})

# Gemini response with markdown code blocks
MOCK_GEMINI_RESPONSE_WITH_MARKDOWN = f"```json\n{MOCK_GEMINI_RESPONSE}\n```"


class TestStudyPackRequest:
    """Test suite for StudyPackRequest"""

    def test_valid_request_creation(self):
        """Test creating a valid StudyPackRequest"""
        valid_text = "This is a valid study note with enough characters"
        
        request = StudyPackRequest(text=valid_text)
        
        assert request.text == valid_text

    def test_rejects_empty_text(self):
        """Test that StudyPackRequest rejects empty text"""
        with pytest.raises(ValidationError) as exc_info:
            StudyPackRequest(text="")
        
        assert "empty" in str(exc_info.value).lower()

    def test_rejects_whitespace_only(self):
        """Test that StudyPackRequest rejects whitespace-only text"""
        with pytest.raises(ValidationError) as exc_info:
            StudyPackRequest(text="   \n\t  ")
        
        assert "empty" in str(exc_info.value).lower()

    def test_rejects_text_too_short(self):
        """Test that StudyPackRequest rejects text less than 10 characters"""
        with pytest.raises(ValidationError) as exc_info:
            StudyPackRequest(text="short")
        
        assert "10 characters" in str(exc_info.value)

    def test_rejects_text_too_long(self):
        """Test that StudyPackRequest rejects text over 10000 characters"""
        with pytest.raises(ValidationError) as exc_info:
            StudyPackRequest(text="a" * 10001)
        
        assert "10000 characters" in str(exc_info.value)

    def test_accepts_text_at_minimum_boundary(self):
        """Test that StudyPackRequest accepts text at exactly 10 characters"""
        minimum_text = "a" * 10
        
        request = StudyPackRequest(text=minimum_text)
        
        assert request.text == minimum_text

    def test_accepts_text_at_maximum_boundary(self):
        """Test that StudyPackRequest accepts text at exactly 10000 characters"""
        maximum_text = "a" * 10000
        
        request = StudyPackRequest(text=maximum_text)
        
        assert request.text == maximum_text

class TestStudyPackEndpoint:
    """Test suite for POST /generate-study-pack endpoint"""

    def test_endpoint_exists(self, client):
        """Test that POST /generate-study-pack endpoint exists"""
        # Even without mocking, endpoint should exist (might fail for other reasons)
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        # Should not return 404 (Not Found)
        assert response.status_code != 404

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_accepts_raw_text_input(self, mock_gemini, client):
        """Test that endpoint accepts raw text input in request body"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 200
        # Verify Gemini was called with the input text
        assert mock_gemini.called
        call_args = mock_gemini.call_args[0][0]
        assert VALID_NOTES in call_args

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_returns_json_matching_contract(self, mock_gemini, client):
        """Test that endpoint returns JSON matching the agreed API contract"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure matches GenerateResponse model
        assert "summary" in data
        assert "quiz" in data
        
        # Validate data types
        assert isinstance(data["summary"], list)
        assert isinstance(data["quiz"], list)
        
        # Validate summary items are strings
        for item in data["summary"]:
            assert isinstance(item, str)
        
        # Validate quiz structure
        for question in data["quiz"]:
            assert "question" in question
            assert "options" in question
            assert "answer" in question
            assert isinstance(question["question"], str)
            assert isinstance(question["options"], list)
            assert isinstance(question["answer"], str)

    def test_validates_empty_input(self, client):
        """Test that endpoint rejects empty text"""
        response = client.post(
            "/generate-study-pack",
            json={"text": ""}
        )
        
        assert response.status_code == 422
        error_detail = response.json()["detail"]
        # Check that validation error mentions empty text
        assert any("empty" in str(err).lower() for err in error_detail)

    def test_validates_whitespace_only_input(self, client):
        """Test that endpoint rejects whitespace-only text"""
        response = client.post(
            "/generate-study-pack",
            json={"text": "   \n\t  "}
        )
        
        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("empty" in str(err).lower() for err in error_detail)

    def test_validates_input_too_short(self, client):
        """Test that endpoint rejects text less than 10 characters"""
        response = client.post(
            "/generate-study-pack",
            json={"text": "short"}
        )
        
        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("10 characters" in str(err) for err in error_detail)

    def test_validates_input_length_exceeds_maximum(self, client):
        """Test that endpoint rejects text exceeding 10000 characters"""
        long_text = "a" * 10001
        
        response = client.post(
            "/generate-study-pack",
            json={"text": long_text}
        )
        
        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("10000 characters" in str(err) for err in error_detail)

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_validates_input_length_at_maximum_boundary(self, mock_gemini, client):
        """Test that endpoint accepts text at exactly 10000 characters"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        # Create text of exactly 10000 characters (excluding whitespace)
        boundary_text = "a" * 10000
        
        response = client.post(
            "/generate-study-pack",
            json={"text": boundary_text}
        )
        
        assert response.status_code == 200

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_validates_input_length_at_minimum_boundary(self, mock_gemini, client):
        """Test that endpoint accepts text at exactly 10 characters"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        minimum_text = "a" * 10
        
        response = client.post(
            "/generate-study-pack",
            json={"text": minimum_text}
        )
        
        assert response.status_code == 200

    def test_validates_missing_text_field(self, client):
        """Test that endpoint rejects request without text field"""
        response = client.post(
            "/generate-study-pack",
            json={}
        )
        
        assert response.status_code == 422  # Pydantic validation error

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_endpoint_works_end_to_end(self, mock_gemini, client):
        """Test complete end-to-end flow with successful study pack generation"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify complete response structure
        assert len(data["summary"]) == 3
        assert len(data["quiz"]) == 3
        
        # Verify first summary point
        assert "Supervised learning" in data["summary"][0]
        
        # Verify first quiz question
        first_question = data["quiz"][0]
        assert "labeled data" in first_question["question"]
        assert len(first_question["options"]) == 4
        assert first_question["answer"] == "Supervised learning"

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_markdown_code_blocks(self, mock_gemini, client):
        """Test that endpoint handles Gemini responses with markdown code blocks"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE_WITH_MARKDOWN
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "quiz" in data

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_gemini_api_unavailable(self, mock_gemini, client):
        """Test that endpoint handles Gemini API returning None"""
        mock_gemini.return_value = None
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_invalid_json_from_gemini(self, mock_gemini, client):
        """Test that endpoint handles invalid JSON from Gemini"""
        mock_gemini.return_value = "This is not valid JSON {{"
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 500
        assert "JSON" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_missing_summary_field(self, mock_gemini, client):
        """Test that endpoint handles Gemini response missing summary field"""
        invalid_response = json.dumps({
            "quiz": [
                {
                    "question": "Test?",
                    "options": ["A", "B", "C", "D"],
                    "answer": "A"
                }
            ]
        })
        mock_gemini.return_value = invalid_response
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 500
        assert "summary" in response.json()["detail"].lower()

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_missing_quiz_field(self, mock_gemini, client):
        """Test that endpoint handles Gemini response missing quiz field"""
        invalid_response = json.dumps({
            "summary": ["Point 1", "Point 2", "Point 3"]
        })
        mock_gemini.return_value = invalid_response
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 500
        assert "quiz" in response.json()["detail"].lower()

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_malformed_quiz_question(self, mock_gemini, client):
        """Test that endpoint handles quiz question missing required fields"""
        invalid_response = json.dumps({
            "summary": ["Point 1", "Point 2", "Point 3"],
            "quiz": [
                {
                    "question": "Test?",
                    # Missing options and answer
                }
            ]
        })
        mock_gemini.return_value = invalid_response
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 500

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_response_content_type(self, mock_gemini, client):
        """Test that endpoint returns JSON content type"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        response = client.post(
            "/generate-study-pack",
            json={"text": VALID_NOTES}
        )
        
        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_various_input_formats(self, mock_gemini, client):
        """Test endpoint with various valid input formats"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE
        
        test_cases = [
            "Simple single line notes that are long enough",
            "Multi-line\nnotes\nwith\nlinebreaks and enough content",
            "Notes with special chars: !@#$%^&*() and more text here",
            "Notes with unicode: 你好 안녕하세요 with additional content",
            "Notes with numbers: 123 456 789 and mathematical symbols ∑ ∏ ∫",
        ]
        
        for notes in test_cases:
            response = client.post(
                "/generate-study-pack",
                json={"text": notes}
            )
            assert response.status_code == 200, f"Failed for input: {notes}"



if __name__ == "__main__":
    pytest.main([__file__, "-v"])