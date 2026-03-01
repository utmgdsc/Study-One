"""
Unit tests for Generating MCQ Quiz Questions.

================================================================================
⚠️  API KEY CONSUMPTION WARNING
================================================================================

These unit tests use MOCKS and do NOT consume API quota.

To avoid accidental quota usage:
    - Run unit tests (this file) for regular development
    - Only run test_quiz.py when you need to verify the API connection

================================================================================
HOW TO RUN TESTS
================================================================================

IMPORTANT: You must be in the backend/ directory to run these tests.

Start Virtual Environment:

Run all tests:
    pytest tests/test_quiz_unit.py -v

Run a specific test:
    pytest tests/test_quiz_unit.py::TestGenerateQuizEndpoint::test_endpoint_exists -v

================================================================================
DEFINITION OF DONE COVERAGE
================================================================================

  ✅ Questions structured      — question, options, answer, topic present
  ✅ Correct answer stored     — answer value matches one of the options
  ✅ JSON validated            — 5–10 questions, proper types, field checks
  ✅ No hallucinated formatting — markdown fences stripped, pure JSON parsed
  ✅ Endpoint documented       — HTTP method, 422/500 error contracts verified

"""

import sys
import os
import pytest
import json
from unittest.mock import AsyncMock, patch

from main import app, StudyPackRequest, MCQuiz, clean_response
from services.gemini import GeminiService
from fastapi.testclient import TestClient

from pydantic import ValidationError

# Add the parent directory to the path to import main module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


# ---------------------------------------------------------------------------
# Test client
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
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


def _make_quiz_payload(n: int = 5) -> list:
    """Return a list of n valid quiz question dicts."""
    return [
        {
            "question": f"Sample question {i + 1}?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "Option A",
            "topic": f"Topic {i + 1}",
        }
        for i in range(n)
    ]


MOCK_GEMINI_RESPONSE = json.dumps({
    "quiz": [
        {
            "question": "What do plants convert light energy into?",
            "options": ["Kinetic energy", "Chemical energy", "Thermal energy", "Nuclear energy"],
            "answer": "Chemical energy",
            "topic": "Energy Conversion"
        },
        {
            "question": "Where is chlorophyll found in a plant cell?",
            "options": ["Mitochondria", "Nucleus", "Chloroplasts", "Vacuole"],
            "answer": "Chloroplasts",
            "topic": "Cell Organelles"
        },
        {
            "question": "What gas is produced as a by-product of photosynthesis?",
            "options": ["Carbon dioxide", "Nitrogen", "Hydrogen", "Oxygen"],
            "answer": "Oxygen",
            "topic": "Gas By-products"
        },
        {
            "question": "Which pigment absorbs sunlight during photosynthesis?",
            "options": ["Melanin", "Chlorophyll", "Carotene", "Hemoglobin"],
            "answer": "Chlorophyll",
            "topic": "Light Absorption"
        },
        {
            "question": "How many main stages does photosynthesis have?",
            "options": ["One", "Two", "Three", "Four"],
            "answer": "Two",
            "topic": "Photosynthesis Stages"
        },
    ]
})

MOCK_GEMINI_RESPONSE_WITH_MARKDOWN = f"```json\n{MOCK_GEMINI_RESPONSE}\n```"
MOCK_GEMINI_RESPONSE_WITH_GENERIC_FENCE = f"```\n{MOCK_GEMINI_RESPONSE}\n```"


# ---------------------------------------------------------------------------
# TestQuizRequest  —  Pydantic model validation only
# ---------------------------------------------------------------------------

class TestQuizRequest:
    """
    Generation of quiz uses StudyPackRequest for input. 
    Test suite for input validation at the model level
    """

    def test_valid_request_creation(self):
        """Test creating a valid StudyPackRequest"""
        valid_text = "This is a valid study note with enough characters"

        request = StudyPackRequest(text=valid_text)

        assert request.text == valid_text

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


# ---------------------------------------------------------------------------
# TestQuizQuestionStructure
# ---------------------------------------------------------------------------

class TestQuizQuestionStructure:
    """Test suite verifying each MCQ question is correctly structured"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_response_contains_quiz_array(self, mock_gemini, client, auth_headers):
        """Test that the response body contains a top-level 'quiz' array"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "quiz" in data
        assert isinstance(data["quiz"], list)

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_each_question_has_required_fields(self, mock_gemini, client, auth_headers):
        """Test that every quiz item contains question, options, answer and topic"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for q in response.json()["quiz"]:
            assert "question" in q, "Missing 'question' field"
            assert "options" in q,  "Missing 'options' field"
            assert "answer" in q,   "Missing 'answer' field"
            assert "topic" in q,    "Missing 'topic' field"

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_options_is_a_list(self, mock_gemini, client, auth_headers):
        """Test that the options field is always a list"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for q in response.json()["quiz"]:
            assert isinstance(q["options"], list)

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_question_topic_and_answer_are_strings(self, mock_gemini, client, auth_headers):
        """Test that question, topic, and answer are all string values"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for q in response.json()["quiz"]:
            assert isinstance(q["question"], str)
            assert isinstance(q["topic"], str)
            assert isinstance(q["answer"], str)

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_topic_is_non_empty(self, mock_gemini, client, auth_headers):
        """Test that the topic field is never a blank string"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for q in response.json()["quiz"]:
            assert q["topic"].strip() != "", "Topic must not be blank"

# ---------------------------------------------------------------------------
# TestCorrectAnswerStored
# ---------------------------------------------------------------------------

class TestCorrectAnswerStored:
    """Test suite verifying the correct answer is stored and matches options"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_answer_match_an_option(self, mock_gemini, client, auth_headers):
        """Test that the answer value exactly matches one entry in options"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for q in response.json()["quiz"]:
            assert q["answer"] in q["options"], (
                f"Answer '{q['answer']}' not found in options {q['options']}"
            )

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_answer_is_stored_verbatim(self, mock_gemini, client, auth_headers):
        """Test that the answer value round-trips exactly without mutation"""
        payload = json.dumps({
            "quiz": [
                {
                    "question": "What is 2 + 2?",
                    "options": ["3", "4", "5", "6"],
                    "answer": "4",
                    "topic": "Basic Arithmetic",
                }
                for _ in range(5)
            ]
        })
        mock_gemini.return_value = payload

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        for q in response.json()["quiz"]:
            assert q["answer"] == "4"


# ---------------------------------------------------------------------------
# TestJSONValidation
# ---------------------------------------------------------------------------

class TestJSONValidation:
    """Test suite verifying JSON structure, count bounds, and field-level checks"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_question_count_within_bounds(self, mock_gemini, client, auth_headers):
        """Test that 5, 7, and 10 question counts are all accepted with 200"""
        for n in (5, 7, 10):
            mock_gemini.return_value = json.dumps({"quiz": _make_quiz_payload(n)})

            response = client.post(
                "/api/v1/quiz",
                json={"text": VALID_NOTES},
                headers=auth_headers,
            )

            assert response.status_code == 200, f"Expected 200 for n={n}, got {response.status_code}"
            assert len(response.json()["quiz"]) == n

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_fewer_than_5_questions(self, mock_gemini, client, auth_headers):
        """Test that fewer than 5 questions causes a 500 with a descriptive error"""
        mock_gemini.return_value = json.dumps({"quiz": _make_quiz_payload(4)})

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "at least 5" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_more_than_10_questions(self, mock_gemini, client, auth_headers):
        """Test that more than 10 questions causes a 500 with a descriptive error"""
        mock_gemini.return_value = json.dumps({"quiz": _make_quiz_payload(11)})

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "at most 10" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_quiz_key(self, mock_gemini, client, auth_headers):
        """Test that a response without a 'quiz' key causes a 500"""
        mock_gemini.return_value = json.dumps({"data": []})

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "'quiz'" in response.json()["detail"] 

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_question_field(self, mock_gemini, client, auth_headers):
        """Test that a quiz item missing 'question' causes a 500 mentioning the field"""
        bad = {"quiz": [{"options": ["A", "B"], "answer": "A", "topic": "T"} for _ in range(5)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "question" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_options_field(self, mock_gemini, client, auth_headers):
        """Test that a quiz item missing 'options' causes a 500 mentioning the field"""
        bad = {"quiz": [{"question": "Q?", "answer": "A", "topic": "T"} for _ in range(5)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "options" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_answer_field(self, mock_gemini, client, auth_headers):
        """Test that a quiz item missing 'answer' causes a 500 mentioning the field"""
        bad = {"quiz": [{"question": "Q?", "options": ["A", "B"], "topic": "T"} for _ in range(5)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "answer" in response.json()["detail"]
    
    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_missing_topic_field(self, mock_gemini, client, auth_headers):
        """Test that a quiz item missing 'topic' causes a 500 mentioning the field"""
        bad = {"quiz": [{"question": "Q?", "options": ["A", "B"], "answer": "A"} for _ in range(5)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "topic" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_answer_not_in_options(self, mock_gemini, client, auth_headers):
        """Test that a quiz item missing 'answer' causes a 500 mentioning the field"""
        bad = {"quiz": [{"question": "Q?", "options": ["A", "B"], "answer": "C", "topic": "T"} for _ in range(5)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "'answer' not in 'options'" in response.json()["detail"]
    
    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_options_as_string_not_list(self, mock_gemini, client, auth_headers):
        """Test that options supplied as a string (not a list) causes a 500"""
        bad = {"quiz": [{"question": "Q?", "options": "A,B,C,D", "answer": "A", "topic": "T"} for _ in range(5)]}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_quiz_item_not_dict(self, mock_gemini, client, auth_headers):
        """Test that quiz items that are not objects (e.g. strings) cause a 500"""
        bad = {"quiz": ["not a dict"] * 5}
        mock_gemini.return_value = json.dumps(bad)

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500


# ---------------------------------------------------------------------------
# TestNoHallucinatedFormatting
# ---------------------------------------------------------------------------

class TestNoHallucinatedFormatting:
    """Test suite verifying markdown and extra formatting is stripped correctly"""

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_markdown_json_fence(self, mock_gemini, client, auth_headers):
        """Test that a response wrapped in ```json ... ``` is parsed successfully"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE_WITH_MARKDOWN

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "quiz" in data
        assert len(data["quiz"]) > 0

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_generic_code_fence(self, mock_gemini, client, auth_headers):
        """Test that a response wrapped in ``` ... ``` is parsed successfully"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE_WITH_GENERIC_FENCE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert "quiz" in response.json()

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_leading_and_trailing_whitespace(self, mock_gemini, client, auth_headers):
        """Test that leading and trailing whitespace around the JSON is tolerated"""
        mock_gemini.return_value = f"\n\n  {MOCK_GEMINI_RESPONSE}  \n"

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_plain_text_response(self, mock_gemini, client, auth_headers):
        """Test that a plain-text (non-JSON) Gemini response returns a clear 500"""
        mock_gemini.return_value = "Sure! Here are your quiz questions in a nice format."

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "JSON" in response.json()["detail"] or "parse" in response.json()["detail"].lower()

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_empty_string_from_gemini(self, mock_gemini, client, auth_headers):
        """Test that an empty string response from Gemini returns a 500"""
        mock_gemini.return_value = ""

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500

    def test_clean_response_strips_json_fence(self):
        """Unit test: clean_response removes ```json fences"""
        raw = f"```json\n{MOCK_GEMINI_RESPONSE}\n```"

        result = clean_response(raw)

        assert result.startswith("{") or result.startswith("[")
        assert "```" not in result

    def test_clean_response_strips_generic_fence(self):
        """Unit test: clean_response removes generic ``` fences"""
        raw = f"```\n{MOCK_GEMINI_RESPONSE}\n```"

        result = clean_response(raw)

        assert "```" not in result

    def test_clean_response_leaves_plain_json_unchanged(self):
        """Unit test: clean_response does not alter already-clean JSON"""
        result = clean_response(MOCK_GEMINI_RESPONSE)

        assert result == MOCK_GEMINI_RESPONSE.strip()


# ---------------------------------------------------------------------------
# TestGenerateQuizEndpoint
# ---------------------------------------------------------------------------

class TestGenerateQuizEndpoint:
    """Test suite for POST /api/v1/quiz — HTTP contract and error shapes"""

    def test_endpoint_exists(self, client, auth_headers):
        """Test that POST /api/v1/quiz endpoint exists and does not return 404"""
        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code != 404

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_accepts_raw_text_input(self, mock_gemini, client, auth_headers):
        """Test that the endpoint accepts raw text and forwards it to Gemini"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert mock_gemini.called
        call_args = mock_gemini.call_args[0][0]
        assert VALID_NOTES in call_args

    def test_validates_empty_input(self, client, auth_headers):
        """Test that the endpoint rejects an empty text field with 422"""
        response = client.post(
            "/api/v1/quiz",
            json={"text": ""},
            headers=auth_headers,
        )

        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("empty" in str(err).lower() for err in error_detail)

    def test_validates_whitespace_only_input(self, client, auth_headers):
        """Test that the endpoint rejects whitespace-only text with 422"""
        response = client.post(
            "/api/v1/quiz",
            json={"text": "   \n\t  "},
            headers=auth_headers,
        )

        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("empty" in str(err).lower() for err in error_detail)

    def test_validates_input_too_short(self, client, auth_headers):
        """Test that the endpoint rejects text shorter than 10 characters with 422"""
        response = client.post(
            "/api/v1/quiz",
            json={"text": "short"},
            headers=auth_headers,
        )

        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("10 characters" in str(err) for err in error_detail)

    def test_validates_input_exceeds_maximum(self, client, auth_headers):
        """Test that the endpoint rejects text over 10000 characters with 422"""
        response = client.post(
            "/api/v1/quiz",
            json={"text": "a" * 10001},
            headers=auth_headers,
        )

        assert response.status_code == 422
        error_detail = response.json()["detail"]
        assert any("10000 characters" in str(err) for err in error_detail)

    def test_validates_missing_text_field(self, client, auth_headers):
        """Test that the endpoint rejects a request body without a text field"""
        response = client.post(
            "/api/v1/quiz",
            json={},
            headers=auth_headers,
        )

        assert response.status_code == 422

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_handles_gemini_api_unavailable(self, mock_gemini, client, auth_headers):
        """Test that endpoint returns 500 with detail when Gemini returns None"""
        mock_gemini.return_value = None

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "detail" in response.json()
        assert "Failed to generate quiz" in response.json()["detail"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_response_content_type_is_json(self, mock_gemini, client, auth_headers):
        """Test that the endpoint always returns application/json content-type"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_successful_response_schema(self, mock_gemini, client, auth_headers):
        """Test that a successful response matches the GenerateQuizResponse schema"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert list(body.keys()) == ["quiz"]
        first = body["quiz"][0]
        assert set(first.keys()) == {"question", "options", "answer", "topic"}

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_endpoint_works(self, mock_gemini, client, auth_headers):
        """Test complete end-to-end flow with a successful quiz generation"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        response = client.post(
            "/api/v1/quiz",
            json={"text": VALID_NOTES},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert len(data["quiz"]) == 5

        first = data["quiz"][0]
        assert "light energy" in first["question"].lower()
        assert len(first["options"]) == 4
        assert first["answer"] == "Chemical energy"
        assert first["answer"] in first["options"]
        assert first["topic"] == "Energy Conversion"

    @patch.object(GeminiService, 'call_gemini', new_callable=AsyncMock)
    def test_various_input_formats(self, mock_gemini, client, auth_headers):
        """Test endpoint with various valid input formats (unicode, symbols, multiline)"""
        mock_gemini.return_value = MOCK_GEMINI_RESPONSE

        test_cases = [
            "Simple single line notes that are long enough to pass validation",
            "Multi-line\nnotes\nwith\nlinebreaks and enough content to be valid",
            "Notes with special chars: !@#$%^&*() and more text here to pad length",
            "Notes with unicode: 你好 안녕하세요 with additional content to meet minimum",
            "Notes with math symbols ∑ ∏ ∫ ≠ ≤ ≥ and enough padding text here",
        ]

        for notes in test_cases:
            response = client.post(
                "/api/v1/quiz",
                json={"text": notes},
                headers=auth_headers,
            )
            assert response.status_code == 200, f"Failed for input: {notes!r}"



if __name__ == "__main__":
    pytest.main([__file__, "-v"])