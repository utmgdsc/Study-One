import sys
import os
from urllib import response
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

from main import app, calc_xp, PERFECT_SCORE_BONUS, XP_CORRECT, QuizQuestion, QuestionAnswer, grade_quiz

from services.gemini import GeminiService
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}


@pytest.fixture(autouse=True)
def mock_auth():
    from main import app
    from middleware.auth import require_user, user_for_generate

    async def override_user():
        return {"user_id": "test-user-id"}

    app.dependency_overrides[user_for_generate] = override_user
    app.dependency_overrides[require_user] = override_user
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def mock_supabase():
    """
    Mock Supabase wired for the submit flow.
    Returns the mock so tests can inspect call args.

    Default behaviour:
        - quiz fetch: returns QUIZ_QUESTIONS_DB
        - attempt insert: returns ATTEMPT_ID
        - user_activity insert: succeeds silently
        - rpc(increment_xp): succeeds silently
    """
    mock_sb = MagicMock()

    # quiz fetch: sb.table("quiz").select("*").eq(...).single().execute()
    quiz_chain = MagicMock()
    quiz_chain.execute.return_value = MagicMock(
        data={"id": QUIZ_SET_ID, "questions": QUIZ_QUESTIONS_DB}
    )
    quiz_chain.single.return_value = quiz_chain
    quiz_chain.eq.return_value = quiz_chain
    quiz_chain.select.return_value = quiz_chain

    # attempt insert: sb.table("quiz_attempt").insert({...}).execute()
    attempt_chain = MagicMock()
    attempt_chain.execute.return_value = MagicMock(data=[{"id": ATTEMPT_ID}])
    attempt_chain.insert.return_value = attempt_chain

    # user_activity insert
    activity_chain = MagicMock()
    activity_chain.insert.return_value = activity_chain

    # rpc
    mock_sb.rpc.return_value = MagicMock()

    def _route(table_name):
        if table_name == "quiz":
            return quiz_chain
        if table_name == "quiz_attempt":
            return attempt_chain
        if table_name == "user_activity":
            return activity_chain
        return MagicMock()

    mock_sb.table.side_effect = _route
    mock_sb._quiz_chain     = quiz_chain
    mock_sb._attempt_chain  = attempt_chain
    mock_sb._activity_chain = activity_chain

    with patch("main.get_supabase", return_value=mock_sb):
        yield mock_sb

# ---------------------------------------------------------------------------
# Mock data
# ---------------------------------------------------------------------------

QUIZ_SET_ID = str(uuid.uuid4())
ATTEMPT_ID  = str(uuid.uuid4())

QUIZ_QUESTIONS_DB = [
    {
        "question": "What do plants convert light energy into?",
        "options": ["Kinetic energy", "Chemical energy", "Thermal energy", "Nuclear energy"],
        "answer": "Chemical energy",
        "topic": "Energy Conversion",
    },
    {
        "question": "Where is chlorophyll found?",
        "options": ["Mitochondria", "Nucleus", "Chloroplasts", "Vacuole"],
        "answer": "Chloroplasts",
        "topic": "Cell Organelles",
    },
    {
        "question": "What gas is produced as a by-product of photosynthesis?",
        "options": ["Carbon dioxide", "Nitrogen", "Hydrogen", "Oxygen"],
        "answer": "Oxygen",
        "topic": "Gas By-products",
    },
    {
        "question": "Which pigment absorbs sunlight?",
        "options": ["Melanin", "Chlorophyll", "Carotene", "Hemoglobin"],
        "answer": "Chlorophyll",
        "topic": "Light Absorption",
    },
    {
        "question": "How many main stages does photosynthesis have?",
        "options": ["One", "Two", "Three", "Four"],
        "answer": "Two",
        "topic": "Photosynthesis Stages",
    },
]

ALL_CORRECT_ANSWERS = [
    {"question_index": i, "selected_answer": q["answer"]}
    for i, q in enumerate(QUIZ_QUESTIONS_DB)
]

ALL_WRONG_ANSWERS = [
    {"question_index": i, "selected_answer": next(o for o in q["options"] if o != q["answer"])}
    for i, q in enumerate(QUIZ_QUESTIONS_DB)
]

PARTIAL_CORRECT_ANSWERS = [
    {
        "question_index": i,
        "selected_answer": q["answer"] if i % 2 == 0 else next(o for o in q["options"] if o != q["answer"])
    }
    for i, q in enumerate(QUIZ_QUESTIONS_DB)
]

class TestCalcXP:
    """Test suite for the calc_xp helper — no HTTP involved."""

    def test_correct_out_of_one_includes_bonus(self):
        assert calc_xp(correct=1, total=1) == XP_CORRECT + PERFECT_SCORE_BONUS
    
    def test_all_wrong_returns_zero(self):
        assert calc_xp(correct=0, total=5) == 0

    def test_all_correct(self):
        """all correct answers so include bonus"""
        assert calc_xp(correct=5, total=5) == 5 * XP_CORRECT + PERFECT_SCORE_BONUS

    def test_partial_correct_no_bonus(self):
        """partial correct answers, so not include bonus"""
        xp = calc_xp(correct=3, total=5)
        assert xp == 3 * XP_CORRECT
        assert xp != 3 * XP_CORRECT + PERFECT_SCORE_BONUS

   
class TestGradeQuiz:
    """Test grade_quiz helper"""
    
    def _questions(self, n=3):
        questions = []
        for i in range(n):
            q = QuizQuestion(**QUIZ_QUESTIONS_DB[i])
            questions.append(q)
        return questions
    
    def _answers(self, tmp):
        answers = []
        for i, s in tmp:
            a = QuestionAnswer(question_index=i, selected_answer=s)
            answers.append(a)
        return answers
    
    def test_correct_result_fields(self):
        """grade_quiz returns results with all required fields."""
        qs = self._questions(1)
        ans = self._answers([(0, qs[0].answer)])
        r = grade_quiz(ans, qs)[0]
        assert r.question_index == 0
        assert r.question == qs[0].question
        assert r.selected_answer == qs[0].answer
        assert r.correct_answer == qs[0].answer
        assert r.topic == qs[0].topic
        assert r.is_correct is True

    def test_incorrect_result_fields(self):
        """grade_quiz returns results with all required fields."""
        qs = self._questions(1)
        ans = self._answers([(0, "Kinetic energy")])
        r = grade_quiz(ans, qs)[0]
        assert r.question_index == 0
        assert r.question == qs[0].question
        assert r.selected_answer == "Kinetic energy"
        assert r.correct_answer == qs[0].answer
        assert r.topic == qs[0].topic
        assert r.is_correct is False

    def test_result_fields_type(self):
        """grade_quiz returns results with correct field types."""
        qs = self._questions(1)
        ans = self._answers([(0, qs[0].answer)])
        r = grade_quiz(ans, qs)[0]
        assert isinstance(r.question_index, int)
        assert isinstance(r.question, str)
        assert isinstance(r.selected_answer, str)
        assert isinstance(r.correct_answer, str)
        assert isinstance(r.topic, str)
        assert isinstance(r.is_correct, bool)
    
class TestScoreCalculation:
    """Test suite verifying score arithmetic through endpoint"""
    @pytest.mark.usefixtures("mock_supabase")
    def test_all_correct_answers(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["total_correct"] == len(ALL_CORRECT_ANSWERS)
        assert response.json()["total_questions"] == len(QUIZ_QUESTIONS_DB)
        assert isinstance(response.json()["score"], float)
        assert response.json()["score"] == 100.0

    @pytest.mark.usefixtures("mock_supabase")
    def test_all_wrong_answers(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_WRONG_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["total_correct"] == 0
        assert response.json()["total_questions"] == len(QUIZ_QUESTIONS_DB)
        assert isinstance(response.json()["score"], float)
        assert response.json()["score"] == 0.0

    @pytest.mark.usefixtures("mock_supabase")
    def test_partial_correct_answers(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": PARTIAL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["total_correct"] == 3
        assert response.json()["total_questions"] == len(QUIZ_QUESTIONS_DB)
        assert isinstance(response.json()["score"], float)
        assert response.json()["score"] == 60.0
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_score_decimal(self, client, auth_headers, mock_supabase):
        # create size questions
        six_q = QUIZ_QUESTIONS_DB + [
            {
                "question": "What are the raw materials for photosynthesis?",
                "options": ["Oxygen and glucose", "Carbon dioxide and water", "Nitrogen and sunlight", "Glucose and water"],
                "answer": "Carbon dioxide and water",
                "topic": "Raw Materials",
            },
        ]

        mock_supabase._quiz_chain.execute.return_value = MagicMock(
            data={"id": QUIZ_SET_ID, "questions": six_q}
        )

        answers = [ALL_CORRECT_ANSWERS[0]] + ALL_WRONG_ANSWERS[1:] + [
            {"question_index": 5, "selected_answer": "Oxygen and glucose"}
        ]

        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": answers},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["total_correct"] == 1
        assert response.json()["total_questions"] == len(QUIZ_QUESTIONS_DB) + 1
        assert isinstance(response.json()["score"], float)
        assert response.json()["score"] == round((1/6) * 100, 2)

class TestPerQuestionResults:
    """Test suite verifying the per-question results in the response"""
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_number_of_results(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert len(response.json()["results"]) == len(QUIZ_QUESTIONS_DB)

    @pytest.mark.usefixtures("mock_supabase")
    def test_result_all_correct(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert len(response.json()["results"]) == len(QUIZ_QUESTIONS_DB)
        results = response.json()["results"]

        for i, r in enumerate(results):
            assert r["question_index"] == i
            assert r["selected_answer"] == QUIZ_QUESTIONS_DB[i]["answer"]
            assert r["correct_answer"] == QUIZ_QUESTIONS_DB[i]["answer"]
            assert r["is_correct"] is True
            assert r["topic"]  == QUIZ_QUESTIONS_DB[i]["topic"]
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_result_all_wrong(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_WRONG_ANSWERS},
            headers=auth_headers
        )
        assert len(response.json()["results"]) == len(QUIZ_QUESTIONS_DB)
        results = response.json()["results"]

        for i, r in enumerate(results):
            assert r["question_index"] == i
            assert r["selected_answer"] != QUIZ_QUESTIONS_DB[i]["answer"]
            assert r["correct_answer"] == QUIZ_QUESTIONS_DB[i]["answer"]
            assert r["is_correct"] is False
            assert r["topic"]  == QUIZ_QUESTIONS_DB[i]["topic"]

class TesQuizAttempt:
    @pytest.mark.usefixtures("mock_supabase")
    def test_attempt_id(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["attempt_id"] == ATTEMPT_ID

    @pytest.mark.usefixtures("mock_supabase")
    def test_attempt_stored(self, client, auth_headers, mock_supabase):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        
        mock_supabase._attempt_chain.insert.assert_called_once()
        payload = mock_supabase._attempt_chain.insert.call_args[0][0]
       
        assert payload["quiz_set_id"] == QUIZ_SET_ID
        assert payload["user_id"] == "test-user-id"
        assert payload["score"] == 100.0
        assert payload["total_correct"] == len(ALL_CORRECT_ANSWERS)
        assert payload["total_questions"] == len(QUIZ_QUESTIONS_DB)
        assert payload["xp_awarded"] == response.json()["xp_awarded"]
        assert isinstance(payload["results"], list)
        assert len(payload["results"]) == len(QUIZ_QUESTIONS_DB)
        for i, r in enumerate(payload["results"]):
            assert r["question_index"] == i
            assert r["selected_answer"] == ALL_CORRECT_ANSWERS[i]["selected_answer"]
            assert r["correct_answer"] == QUIZ_QUESTIONS_DB[i]["answer"]
            assert r["is_correct"] is True
            assert r["topic"]  == QUIZ_QUESTIONS_DB[i]["topic"]
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_user_activity_stored(self, client, auth_headers, mock_supabase):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        
        mock_supabase._activity_chain.insert.assert_called_once()
        payload = mock_supabase._activity_chain.insert.call_args[0][0]
       
        assert payload["user_id"] == "test-user-id"
        assert payload["activity_type"] == "quiz_submit"
        assert payload["xp_awarded"] == response.json()["xp_awarded"]
        assert payload["metadata"]["quiz_set_id"] == QUIZ_SET_ID
        assert payload["metadata"]["attempt_id"] == ATTEMPT_ID
        assert payload["metadata"]["total_correct"] == len(ALL_CORRECT_ANSWERS)
        assert payload["metadata"]["total_questions"] == len(QUIZ_QUESTIONS_DB)
        assert payload["metadata"]["score"] == 100.0
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_attempt_insert_fail(self, client, auth_headers, mock_supabase):
        mock_supabase._attempt_chain.insert.return_value.execute.side_effect = Exception("insert failed")
        
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 500
        assert "Failed to store quiz attempt" in response.json()["detail"]
        # When attempt insertion fails, there should be no user_activity or XP RPC calls
        mock_supabase._activity_chain.insert.assert_not_called()
        mock_supabase.rpc.assert_not_called()

    @pytest.mark.usefixtures("mock_supabase")
    def test_user_activity_stored_when_xp_zero(self, client, auth_headers, mock_supabase):
        """Activity should still be recorded even when no XP is awarded."""
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_WRONG_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 200

        mock_supabase._activity_chain.insert.assert_called_once()
        payload = mock_supabase._activity_chain.insert.call_args[0][0]
        assert payload["xp_awarded"] == 0
        assert payload["metadata"]["score"] == 0.0

class TestAwardXP:
    """Test suite to check XP awarded properly"""

    @pytest.mark.usefixtures("mock_supabase")
    def test_award_xp_all_correct(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["xp_awarded"] == 5 * XP_CORRECT + PERFECT_SCORE_BONUS

    @pytest.mark.usefixtures("mock_supabase")
    def test_award_xp_all_wrong(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_WRONG_ANSWERS},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["xp_awarded"] == 0

    @pytest.mark.usefixtures("mock_supabase")
    def test_award_xp_partial_correct(self, client, auth_headers):
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": PARTIAL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["xp_awarded"] == 3 * XP_CORRECT  # no bonus

    def test_rpc_called_when_xp_positive(self, client, auth_headers, mock_supabase):
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        mock_supabase.rpc.assert_called_once()
        assert mock_supabase.rpc.call_args[0][1]["p_xp"] == response.json()["xp_awarded"]

    def test_rpc_not_called_when_xp_zero(self, client, auth_headers, mock_supabase):
        client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_WRONG_ANSWERS},
            headers=auth_headers,
        )
        mock_supabase.rpc.assert_not_called()

    def test_xp_rpc_failure_is_non_fatal(self, client, auth_headers, mock_supabase):
        mock_supabase.rpc.return_value.execute.side_effect = Exception("rpc down")
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert "attempt_id" in response.json()

    def test_activity_failure_is_non_fatal(self, client, auth_headers, mock_supabase):
        mock_supabase._activity_chain.insert.return_value.execute.side_effect = Exception("activity down")
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["attempt_id"] == ATTEMPT_ID
    
class TestInputValidation:
    """Test suite for the /quiz/submit input"""

    @pytest.mark.usefixtures("mock_supabase")
    def test_less_answers(self, client, auth_headers, mock_supabase):
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS[1:]},
            headers=auth_headers
        )
        assert response.status_code == 422
        assert "Please answer all questions before submitting" in response.json()["detail"]
        mock_supabase._attempt_chain.insert.assert_not_called()
        mock_supabase._activity_chain.insert.assert_not_called()

    @pytest.mark.usefixtures("mock_supabase")
    def test_more_answers(self, client, auth_headers, mock_supabase):
        answers = ALL_CORRECT_ANSWERS + [{"question_index": 5, "selected_answer": "Hi"}]
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": answers},
            headers=auth_headers
        )
        assert response.status_code == 422
        assert "Please answer all questions before submitting" in response.json()["detail"]
        mock_supabase._attempt_chain.insert.assert_not_called()
        mock_supabase._activity_chain.insert.assert_not_called()

    @pytest.mark.usefixtures("mock_supabase")
    def test_duplicate_answers(self, client, auth_headers, mock_supabase):
        answers = ALL_CORRECT_ANSWERS[1:] + [ALL_WRONG_ANSWERS[1]]
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": answers},
            headers=auth_headers
        )
        assert response.status_code == 422
        assert "no duplicates" in response.json()["detail"]
        mock_supabase._attempt_chain.insert.assert_not_called()
        mock_supabase._activity_chain.insert.assert_not_called()

    @pytest.mark.usefixtures("mock_supabase")
    def test_answer_not_in_option(self, client, auth_headers, mock_supabase):
        answers =  [{"question_index": 0, "selected_answer": "NOT VALID"}] + ALL_CORRECT_ANSWERS[1:] 
        response = client.post(
            "/api/v1/quiz/submit", 
            json={"quiz_id": QUIZ_SET_ID, "answers": answers},
            headers=auth_headers
        )
        assert response.status_code == 422
        assert "not a valid option" in response.json()["detail"]
        mock_supabase._attempt_chain.insert.assert_not_called()
        mock_supabase._activity_chain.insert.assert_not_called()

    @pytest.mark.usefixtures("mock_supabase")
    def test_missing_quiz_id_field(self, client, auth_headers):
        """Omitting 'quiz_id' should fail validation."""
        response = client.post(
            "/api/v1/quiz/submit",
            json={"answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.usefixtures("mock_supabase")
    def test_missing_answers_field(self, client, auth_headers):
        """Omitting 'answers' should fail validation."""
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID},
            headers=auth_headers,
        )
        assert response.status_code == 422
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_wrong_type_answers_field(self, client, auth_headers):
        """Omitting 'answers' should fail validation."""
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": "answer"},
            headers=auth_headers,
        )
        assert response.status_code == 422
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_empty_answers_list(self, client, auth_headers):
        """Empty answers list should be rejected as incomplete."""
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": []},
            headers=auth_headers,
        )
        assert response.status_code == 422
        assert "Please answer all questions before submitting" in response.json()["detail"]

    @pytest.mark.usefixtures("mock_supabase")
    def test_empty_selected_answer_rejected(self, client, auth_headers):
        """Blank selected_answer triggers pydantic validation error."""
        bad_answers = [{"question_index": 0, "selected_answer": "   "}] + ALL_CORRECT_ANSWERS[1:]
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": bad_answers},
            headers=auth_headers,
        )
        assert response.status_code == 422
    
    @pytest.mark.usefixtures("mock_supabase")
    def test_selected_answer_not_string(self, client, auth_headers):
        bad_answers = [{"question_index": 0, "selected_answer": 123}] + ALL_CORRECT_ANSWERS[1:]
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": bad_answers},
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.usefixtures("mock_supabase")
    def test_quiz_index_out_of_range(self, client, auth_headers):
        bad_answers = [{"question_index": 10, "selected_answer": "hi"}] + ALL_CORRECT_ANSWERS[1:]
        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": bad_answers},
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestQuizLookupFailures:
    """Edge cases around loading the quiz from Supabase."""

    @pytest.mark.usefixtures("mock_supabase")
    def test_quiz_not_found(self, client, auth_headers, mock_supabase):
        # Simulate Supabase returning no row for this quiz_id
        mock_supabase._quiz_chain.execute.return_value = None

        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert str(QUIZ_SET_ID) in response.json()["detail"]
        mock_supabase._attempt_chain.insert.assert_not_called()
        mock_supabase._activity_chain.insert.assert_not_called()

    @pytest.mark.usefixtures("mock_supabase")
    def test_quiz_db_failure(self, client, auth_headers, mock_supabase):
        # Simulate low-level Supabase error during quiz fetch
        mock_supabase._quiz_chain.execute.side_effect = Exception("db down")

        response = client.post(
            "/api/v1/quiz/submit",
            json={"quiz_id": QUIZ_SET_ID, "answers": ALL_CORRECT_ANSWERS},
            headers=auth_headers,
        )
        assert response.status_code == 500
        assert "Failed to retrieve quiz" in response.json()["detail"]
        mock_supabase._attempt_chain.insert.assert_not_called()
        mock_supabase._activity_chain.insert.assert_not_called()
