import json
import logging
import re
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from services import GeminiService, get_supabase
from services.gamification import award_flashcard_session_xp, award_quiz_completion_xp
from middleware.auth import require_user, UserPayload, user_for_generate
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from prompts.study_gen_v1 import build_study_generation_prompt, validate_quiz_quality
from prompts.flashcard_gen_v1 import build_flashcard_generation_prompt
from prompts.quiz_gen_v1 import build_quiz_generation_prompt


app = FastAPI(title="Socrato")

# Initialize Gemini service
gemini_service = GeminiService()

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def check_empty_text(v: str) -> str:
    if not v or not v.strip():
        raise ValueError("text must not be empty")
    return v


# ============================================
# REQUEST/RESPONSE SCHEMAS
# Mirrors shared/types.ts contract
# ============================================

class GenerateRequest(BaseModel):
    """
    Request body for POST /api/v1/generate
    - text: The user's study notes to process
    """
    text: str

    @field_validator("text")
    @classmethod
    def text_must_not_be_empty(cls, v: str) -> str:
        return check_empty_text(v)


class StudyPackRequest(GenerateRequest):
    """
    Request body for POST /generate-study-pack
    - text: The user's study notes to process
    """
    @field_validator("text")
    @classmethod
    def text_length_constraint(cls, v: str) -> str:
        v = check_empty_text(v)
        stripped = v.strip()
        # validate length
        if len(stripped) < 10:
            raise ValueError(f"text must not be less than 10 characters")
        if len(stripped) > 10000:
            raise ValueError("text must not be more than 10000 characters")
        return v



class QuizQuestion(BaseModel):
    """A single quiz question with multiple choice options"""
    question: str
    options: List[str]
    answer: str
    topic: str
    # Simple one-paragraph explanation of why the correct answer is right
    # and why the other options are wrong.
    correctionExplanation: Optional[str] = None


class GenerateResponse(BaseModel):
    """
    Response from POST /api/v1/generate
    - summary: Array of bullet point summaries
    - quiz: Array of quiz questions with options and answers
    """
    summary: List[str]
    quiz: List[QuizQuestion]


class AnkiRating(str, Enum):
    AGAIN = "again"
    HARD = "hard"
    GOOD = "good"
    EASY = "easy"

class FlashcardReviewRequest(BaseModel):
    flashcard_set_id: str
    card_index: int
    rating: AnkiRating

class FlashcardReviewResponse(BaseModel):
    xp_awarded: int
    total_xp: int
    already_reviewed: bool


class QuizResultRequest(BaseModel):
    """Request body for POST /api/v1/quiz/result - submit quiz completion for XP."""
    correct: int
    total: int
    quiz_id: Optional[str] = None


class QuizResultResponse(BaseModel):
    """Response from quiz completion - XP and streak via gamification engine."""
    applied: bool
    xp_awarded: int
    user_stats: dict


class FlashcardSessionCompleteRequest(BaseModel):
    """Request body for POST /api/v1/flashcards/session-complete."""
    flashcard_set_id: str


class FlashcardSessionCompleteResponse(BaseModel):
    """Response from flashcard session completion."""
    applied: bool
    xp_awarded: int
    user_stats: dict


# ============================================
# STUDY PACK HELPER FUNCTIONS
# ============================================
def clean_response(response):
    """
    Clean up Gemini response by removing markdown code blocks
    """
    # Clean up response if it has markdown code blocks
    cleaned = response.strip() 
    # remove opening markdown code fence
    cleaned = re.sub(r'^```[a-z]*\n?', '', cleaned) 
    # remove closing markdown code fence
    cleaned = re.sub(r'```$', '', cleaned)

    return cleaned.strip()


def validate_data(data):
    """
    Validate the study pack has all the required fields and return the list of quiz questions
    """
    # Validate required fields exist
    if not isinstance(data.get("summary"), list):
        raise ValueError("Response missing 'summary' array")
    if not isinstance(data.get("quiz"), list):
        raise ValueError("Response missing 'quiz' array")
    
    # Parse quiz questions with validation
    quiz_questions = []
    for i, q in enumerate(data.get("quiz", [])):
        if not isinstance(q, dict):
            raise ValueError(f"Quiz item {i} is not an object")
        if "question" not in q:
            raise ValueError(f"Quiz item {i} missing 'question' field")
        if "options" not in q or not isinstance(q["options"], list):
            raise ValueError(f"Quiz item {i} missing 'options' array")
        if "answer" not in q:
            raise ValueError(f"Quiz item {i} missing 'answer' field")
        
        quiz_questions.append(QuizQuestion(
            question=q["question"],
            options=q["options"],
            answer=q["answer"],
            correctionExplanation=q.get("correctionExplanation")
        ))

    return quiz_questions



# ============================================
# ROUTES
# ============================================

@app.get("/")
def root():
    return {}


@app.get("/health")
def check_health():
    return {"status": "ok"}


@app.get("/api/v1/me")
async def get_current_user(user: UserPayload = Depends(require_user)):
    """Return the authenticated user's identity. 401 if not logged in."""
    return {
        "user_id": user["user_id"],
        "email": user.get("email"),
        "role": user.get("role"),
    }


@app.post("/api/v1/generate", response_model=GenerateResponse)
async def generate_study_materials(
    request: GenerateRequest,
    _user: Optional[UserPayload] = Depends(user_for_generate),
):
    """Generate study materials from user notes. Auth controlled by REQUIRE_AUTH_FOR_GENERATE."""

    # Build prompt using the centralized prompt system
    prompt = build_study_generation_prompt(
        user_notes=request.text,
        include_examples=True  # Include few-shot examples for better quality
    )

    response = await gemini_service.call_gemini(prompt)
    
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate study materials. Please try again."
        )
    
    # Parse the JSON response from Gemini
    try:
        # Clean up response if it has markdown code blocks
        cleaned = clean_response(response)
        
        data = json.loads(cleaned)
        
        quiz_questions = validate_data(data)
        
        # Optional: Run quality checks on the quiz
        quality_warnings = validate_quiz_quality(data.get("quiz", []))
        if quality_warnings:
            # print(f"[generate] Quality warnings: {quality_warnings}")
            # Can log these or return them to the frontend in the future
            logger.info("Quiz quality warnings count: %d", len(quality_warnings))


        return GenerateResponse(
            summary=data.get("summary", []),
            quiz=quiz_questions
        )
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse Gemini JSON: %s", e)
        logger.debug("Raw Gemini response length: %s", len(response) if response else 0)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response as JSON. Please try again."
        )
    except (KeyError, TypeError, ValueError) as e:
        logger.warning("Invalid Gemini response structure: %s", e)
        logger.debug("Raw Gemini response length: %s", len(response) if response else 0)
        raise HTTPException(
            status_code=500,
            detail=f"Invalid AI response format: {str(e)}"
        )


# ============================================
# STUDY PACK ROUTE
# ============================================


@app.post("/generate-study-pack", response_model=GenerateResponse)
async def generate_study_pack(
    request: StudyPackRequest,
    _user: Optional[UserPayload] = Depends(user_for_generate),
):
    """Generate a study pack from user notes. Auth controlled by REQUIRE_AUTH_FOR_GENERATE."""
    prompt = build_study_generation_prompt(
        user_notes=request.text,
        include_examples=True,
    )
           
    # Call Gemini API
    response = await gemini_service.call_gemini(prompt)
    
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Gemini unavailable. Please try again."
        )
        
    try:
        # Clean up response if it has markdown code blocks
        cleaned = clean_response(response)
        
        data = json.loads(cleaned)
        
        # Validate required fields exist
        quiz_questions = validate_data(data)

        quality_warnings = validate_quiz_quality(data.get("quiz", []))
        if quality_warnings:
            logger.info("Quiz quality warnings count: %d", len(quality_warnings))
        
        return GenerateResponse(
            summary=data['summary'],
            quiz=quiz_questions
        )
    
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse Gemini JSON: %s", e)
        logger.debug("Raw Gemini response: %s", response)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response as JSON. Please try again."
        )
    except (KeyError, TypeError, ValueError) as e:
        logger.warning("Invalid Gemini response structure: %s", e)
        logger.debug("Raw Gemini response: %s", response)
        raise HTTPException(
            status_code=500,
            detail=f"Invalid AI response format: {str(e)}"
        )
    

# ============================================
# QUIZ SCHEMA
# ============================================

class GenerateQuizResponse(BaseModel):
    """
    Response from POST /api/v1/quiz
    - quiz: Array of quiz questions with options, answers, and a linked topic
    """
    quiz_set_id: str
    quiz: list[QuizQuestion]

class QuestionAnswer(BaseModel):
    question_index: int
    selected_answer: str

    @field_validator("selected_answer")
    @classmethod
    def answer_not_empty(cls, v: str) -> str:
        v = check_empty_text(v)
        return v

class QuizSubmitRequest(BaseModel):
    quiz_id: str
    answers: list[QuestionAnswer]

class QuestionResult(BaseModel):
    question_index: int
    question: str
    selected_answer: str
    correct_answer: str
    is_correct: bool
    topic: str
    correction_explanation: Optional[str] = None

class QuizSubmitResponse(BaseModel):
    attempt_id: str
    quiz_set_id: str
    score: float
    total_correct: int
    total_questions: int
    xp_awarded: int
    results: list[QuestionResult]

# XP awarded per correct answer 
XP_CORRECT = 25
# if user gets all the quiz questions right, get a bonus 
PERFECT_SCORE_BONUS = 15


# ============================================
# QUIZ HELPER
# ============================================

def parse_and_validate_quiz(raw_response: str) -> list[QuizQuestion]:
    """Parse Gemini JSON and validate structure for quiz.""" 
    cleaned = clean_response(raw_response)
    try:
        data = json.loads(cleaned)
    
        raw_quiz = data.get("quiz")
        if not isinstance(raw_quiz, list):
            raise ValueError("Response missing 'quiz' array")
        # check the number of quiz generated
        if len(raw_quiz) < 5 or len(raw_quiz) > 10:
            raise ValueError(f"Expected 5-10 questions, got {len(raw_quiz)}.")

        # Parse quiz questions with validation
        quiz_questions = []
        for i, q in enumerate(data.get("quiz", [])):
            if not isinstance(q, dict):
                raise ValueError(f"Quiz item {i} is not an object")
            if "question" not in q:
                raise ValueError(f"Quiz item {i} missing 'question' field")
            if "options" not in q or not isinstance(q["options"], list):
                raise ValueError(f"Quiz item {i} missing 'options' array")
            if "answer" not in q:
                raise ValueError(f"Quiz item {i} missing 'answer' field")
            if "topic" not in q or not q["topic"].strip():
                raise ValueError(f"Quiz item {i} missing 'topic' field")
            if q["answer"] not in q["options"]:
                raise ValueError(f"Quiz item {i} 'answer' not in 'options'")
            

            quiz_questions.append(QuizQuestion(
                question=q["question"],
                options=q["options"],
                answer=q["answer"],
                topic=q["topic"],
                correctionExplanation=q.get("correctionExplanation"),
            ))
        
        return quiz_questions
    except json.JSONDecodeError as e:
        logger.warning("[quiz] Failed to parse Gemini JSON: %s", e)
        logger.debug("[quiz] Raw Gemini response: %s", raw_response)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response as JSON. Please try again."
        )
    except (KeyError, TypeError, ValueError) as e:
        logger.warning("[quiz] Invalid Gemini response structure: %s", e)
        logger.debug("[quiz] Raw Gemini response: %s", raw_response)
        raise HTTPException(
            status_code=500,
            detail=f"Invalid AI response format: {str(e)}"
        )

def grade_quiz(answers: list[QuestionAnswer], questions: list[QuizQuestion]) -> list[QuestionResult]:
    # get all the answers from the user
    user_answers = {a.question_index: a.selected_answer for a in answers}

    quiz_results = []

    for i, q in enumerate(questions):
        ans = user_answers.get(i, "")
        is_correct = ans == q.answer

        result = QuestionResult(
            question_index=i,
            question=q.question,
            selected_answer=ans,
            correct_answer=q.answer,
            is_correct=is_correct,
            topic=q.topic,
            correction_explanation=q.correctionExplanation,
        ) 
        quiz_results.append(result)
    
    return quiz_results

def calc_xp(correct: int, total: int) -> int:
    """ Assign XP based on whether user got answer correct or wrong? """
    xp = correct * XP_CORRECT
    if correct == total: 
        xp += PERFECT_SCORE_BONUS
    return xp

def validate_submit_quiz_request(request: QuizSubmitRequest) -> None:
    try: 
        if not request.quiz_id:
            raise ValueError("Missing 'quiz_id' field.")
        # Allow an empty list to flow through to the length check later;
        # we only treat a completely absent answers field as invalid here.
        if request.answers is None:  # type: ignore[comparison-overlap]
            raise ValueError("Missing 'answers' field.")
        if not isinstance(request.quiz_id, str):
            raise ValueError(f"Invalid 'quiz_id' field.")  
        if not isinstance(request.answers, list):
            raise ValueError(f"Invalid 'answers' field.")

        for a in request.answers:
            if not isinstance(a, QuestionAnswer): 
                raise ValueError(f"Invalid 'answers' field.")
            if not isinstance(a.question_index, int):
                raise ValueError(f"Invalid 'question_index' field.")
            if not isinstance(a.selected_answer, str):
                raise ValueError(f"Invalid 'selected_answer' field.")
            if a.selected_answer.strip() == "":
                raise ValueError(f"Invalid 'selected_answer' field.")
    except (KeyError, TypeError, ValueError) as e:
        logger.warning("[quiz submit] Invalid Request: %s", e)
        raise HTTPException(
            status_code=422,
            detail=f"Invalid request format: {str(e)}"
        )

@app.post("/api/v1/quiz", response_model=GenerateQuizResponse)
async def generate_quiz_questions(
    request: StudyPackRequest,
    user: UserPayload | None = Depends(user_for_generate),
):
    """Generate MC Quiz from user notes. Store quiz in supabase."""

    prompt = build_quiz_generation_prompt(content=request.text)
    response = await gemini_service.call_gemini(prompt)
    
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate quiz. Please try again."
        )
    
    # clean up and parse the raw response from Gemini
    quiz_questions = parse_and_validate_quiz(response)

    # store quiz into supabase
    sb = get_supabase()
    try:
        result = sb.table("quiz").insert({
            "user_id": user["user_id"] if user else "00000000-0000-0000-0000-000000000001",
            "source_text": request.text,
            "questions": [q.model_dump() for q in quiz_questions],
        }).execute()
        quiz_set_id = result.data[0]["id"]
    except Exception as e:
        print(f"[quiz] DB insert failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to store quiz. Please try again."
        )


    return GenerateQuizResponse(quiz_set_id=quiz_set_id, quiz=quiz_questions)
    

@app.post("/api/v1/quiz/submit", response_model=QuizSubmitResponse)
async def submit_quiz(
    request: QuizSubmitRequest,
    user: UserPayload = Depends(require_user),
):
    """Attempt MC Quiz. Grade the user's attempt at the quiz and store the results. """
    
    # check if the request is valid
    validate_submit_quiz_request(request)
    
    sb = get_supabase()
    user_id = user["user_id"]

    # get the corresponding quiz from the database to get the correct answer
    try: 
        quiz_data = sb.table("quiz") \
        .select("*") \
        .eq("id", request.quiz_id) \
        .single() \
        .execute()

        if not quiz_data:
            raise HTTPException(status_code=404, detail=f"Quiz {request.quiz_id} not found.")

        questions = [QuizQuestion(**q) for q in quiz_data.data["questions"]]

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[quiz submit] DB query failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve quiz. Please try again."
        )

     # user not answer all questions
    if len(request.answers) != len(questions):
        raise HTTPException(
            status_code=422,
            detail=f"Expected {len(questions)} answers but received {len(request.answers)}. Please answer all questions before submitting."
        )

    # if user submit duplicate answers for the same question
    submitted_indices = [a.question_index for a in request.answers]
    if sorted(submitted_indices) != list(range(len(questions))):
        raise HTTPException(
            status_code=422,
            detail="Answers must contain exactly one response per question with no duplicates."
        )

   # check user's answers are in question options
    for ans in request.answers:
        if ans.question_index < 0 or ans.question_index >= len(questions):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid 'question_index' {ans.question_index}. Must be between 0 and {len(questions)-1}."
            )
        if ans.selected_answer not in questions[ans.question_index].options:
            raise HTTPException(
                status_code=422,
                detail=f"Question {ans.question_index}: '{ans.selected_answer}' is not a valid option."
            )

    # grade the user's response
    question_result = grade_quiz(request.answers, questions)
    correct = sum(1 for qr in question_result if qr.is_correct)
    total = len(questions)
    score = round((correct / total) * 100, 2)
    xp = calc_xp(correct, total)

    # store the user's attempt of the quiz into supabase
    try:
        result = sb.table("quiz_attempt").insert({
            "user_id": user["user_id"] if user else "00000000-0000-0000-0000-000000000001",
            "quiz_set_id": request.quiz_id,
            "score": score, 
            "total_correct": correct, 
            "total_questions": total, 
            "xp_awarded": xp, 
            "results": [qr.model_dump() for qr in question_result],
        }).execute()
        attempt_id = result.data[0]["id"]
    except Exception as e:
        logger.warning(f"[quiz submit] DB insert failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to store quiz attempt. Please try again."
        )
    
    # award XP 
    try:
        sb.table("user_activity").insert({
            "user_id": user_id,
            "activity_type": "quiz_submit",
            "xp_awarded": xp,
            "metadata": {
                "quiz_set_id": request.quiz_id,
                "attempt_id": attempt_id,
                "total_correct": correct,
                "total_questions": total, 
                "score": score
            },
        }).execute()
    except Exception as e:
        logger.warning("Failed to insert user_activity: %s", e)

    if xp > 0:
        try:
            sb.rpc("increment_xp", {"p_user_id": user_id, "p_xp": xp}).execute()
        except Exception as e:
            logger.warning("Failed to increment XP: %s", e)
            # Non-fatal, don't fail the whole request over XP

    submit_response = QuizSubmitResponse(
        attempt_id=attempt_id,
        quiz_set_id=request.quiz_id,
        score=score,
        total_correct=correct, 
        total_questions=total,
        xp_awarded=xp,
        results=question_result
    )

    return submit_response
    

@app.post("/api/v1/quiz/result", response_model=QuizResultResponse)
async def submit_quiz_result(
    request: QuizResultRequest,
    user: UserPayload = Depends(require_user),
):
    """Submit quiz completion for XP. Awards 25 XP base + 15 bonus for perfect score. Idempotent per day."""
    try:
        result = award_quiz_completion_xp(
            user_id=user["user_id"],
            correct=request.correct,
            total=request.total,
            quiz_id=request.quiz_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.warning("Quiz result apply_activity failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to record quiz result.")
    return QuizResultResponse(
        applied=result["applied"],
        xp_awarded=result["xp_awarded"],
        user_stats=result["user_stats"],
    )


# ============================================
# FLASHCARD SCHEMAS
# ============================================

class FlashcardRequest(BaseModel):
    text: Optional[str] = None
    topic: Optional[str] = None

    @field_validator("text", "topic")
    @classmethod
    def strip_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        return v or None

    def model_post_init(self, __context) -> None:
        if not self.text and not self.topic:
            raise ValueError("Either 'text' or 'topic' must be provided.")


class Flashcard(BaseModel):
    question: str
    answer: str


class FlashcardResponse(BaseModel):
    flashcard_set_id: str
    flashcards: List[Flashcard]


# ============================================
# FLASHCARD HELPERS
# ============================================

def parse_and_validate_flashcards(raw_response: str) -> List[Flashcard]:
    """Parse Gemini JSON and validate structure for flashcards."""
    # Use the existing cleaning logic from clean_response
    cleaned = clean_response(raw_response)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"[flashcards] Failed to parse JSON: {e}")
        print(f"[flashcards] Raw response: {raw_response}")
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response as JSON. Please try again."
        )

    flashcards_raw = data.get("flashcards")
    if not isinstance(flashcards_raw, list):
        raise HTTPException(
            status_code=500,
            detail="Invalid AI response: 'flashcards' must be an array."
        )
    if len(flashcards_raw) != 10:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid AI response: expected 10 flashcards, got {len(flashcards_raw)}."
        )

    flashcards = []
    for i, fc in enumerate(flashcards_raw):
        if not isinstance(fc, dict):
            raise HTTPException(status_code=500, detail=f"Flashcard {i} is not an object.")
        q = fc.get("question")
        a = fc.get("answer")
        if not isinstance(q, str) or not q.strip():
            raise HTTPException(status_code=500, detail=f"Flashcard {i} missing valid 'question'.")
        if not isinstance(a, str) or not a.strip():
            raise HTTPException(status_code=500, detail=f"Flashcard {i} missing valid 'answer'.")
        flashcards.append(Flashcard(question=q.strip(), answer=a.strip()))

    return flashcards

@app.post("/api/v1/flashcards", response_model=FlashcardResponse)
async def generate_flashcards(
    request: FlashcardRequest, 
    user: Optional[UserPayload] = Depends(user_for_generate)):
    """
    Generate 10 Q/A flashcards from notes or a topic, store in Supabase.
    """
    content = request.text if request.text else request.topic
    mode = "notes" if request.text else "topic"

    prompt = build_flashcard_generation_prompt(
        content=content,
        mode=mode,
    )

    response = await gemini_service.call_gemini(prompt)
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate flashcards. Please try again."
        )

    flashcards = parse_and_validate_flashcards(response)

    # Store in Supabase
    sb = get_supabase()
    try:
        result = sb.table("flashcards").insert({
            "user_id": user["user_id"] if user else "00000000-0000-0000-0000-000000000001",
            "source_text": request.text,
            "topic": request.topic,
            "cards": [fc.model_dump() for fc in flashcards],
        }).execute()
        flashcard_set_id = result.data[0]["id"]
    except Exception as e:
        print(f"[flashcards] DB insert failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to store flashcards. Please try again."
        )

    return FlashcardResponse(flashcard_set_id=flashcard_set_id, flashcards=flashcards)


@app.post("/api/v1/flashcards/session-complete", response_model=FlashcardSessionCompleteResponse)
async def complete_flashcard_session(
    request: FlashcardSessionCompleteRequest,
    user: UserPayload = Depends(require_user),
):
    """Record flashcard session completion for XP. Awards 10 XP. Idempotent per day."""
    try:
        result = award_flashcard_session_xp(
            user_id=user["user_id"],
            session_id=request.flashcard_set_id,
        )
    except RuntimeError as e:
        logger.warning("Flashcard session apply_activity failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to record session.")
    return FlashcardSessionCompleteResponse(
        applied=result["applied"],
        xp_awarded=result["xp_awarded"],
        user_stats=result["user_stats"],
    )


@app.post("/api/v1/flashcards/review", response_model=FlashcardReviewResponse)
async def submit_flashcard_review(
    request: FlashcardReviewRequest,
    user: UserPayload = Depends(require_user),
):
    """Record an Anki-style flashcard review. XP is awarded via POST /api/v1/flashcards/session-complete."""
    sb = get_supabase()
    user_id = user["user_id"]
    today = datetime.now(timezone.utc).date().isoformat()

    # Check for duplicate review today
    existing = sb.table("flashcard_reviews") \
        .select("id") \
        .eq("user_id", user_id) \
        .eq("flashcard_set_id", request.flashcard_set_id) \
        .eq("card_index", request.card_index) \
        .gte("reviewed_at", today) \
        .execute()

    if existing.data:
        stats_result = sb.table("user_stats").select("xp_total").eq("user_id", user_id).maybe_single().execute()
        total_xp = stats_result.data["xp_total"] if stats_result.data else 0
        return FlashcardReviewResponse(xp_awarded=0, total_xp=total_xp, already_reviewed=True)

    try:
        sb.table("flashcard_reviews").insert({
            "user_id": user_id,
            "flashcard_set_id": request.flashcard_set_id,
            "card_index": request.card_index,
            "rating": request.rating.value,
            "xp_awarded": 0,
        }).execute()
    except Exception as e:
        logger.warning("Failed to insert flashcard_reviews: %s", e)
        raise HTTPException(status_code=500, detail="Failed to record review. Please try again.")

    stats_result = sb.table("user_stats").select("xp_total").eq("user_id", user_id).maybe_single().execute()
    total_xp = stats_result.data["xp_total"] if stats_result.data else 0

    return FlashcardReviewResponse(xp_awarded=0, total_xp=total_xp, already_reviewed=False)


@app.get("/api/v1/flashcards/{flashcard_set_id}/session-summary")
async def get_session_summary(
    flashcard_set_id: str,
    user: Optional[UserPayload] = Depends(user_for_generate),
):
    """Return today's ratings for this flashcard set."""
    sb = get_supabase()
    user_id = user["user_id"] if user else "00000000-0000-0000-0000-000000000001"
    today = datetime.now(timezone.utc).date().isoformat()

    result = sb.table("flashcard_reviews") \
        .select("card_index, rating, reviewed_at") \
        .eq("user_id", user_id) \
        .eq("flashcard_set_id", flashcard_set_id) \
        .gte("reviewed_at", today) \
        .order("reviewed_at", desc=True) \
        .execute()

    return {"reviews": result.data}


RATING_PRIORITY = {"again": 0, "hard": 1, "good": 2, "easy": 3}

@app.get("/api/v1/flashcards/{flashcard_set_id}/history")
async def get_card_history(
    flashcard_set_id: str,
    user: Optional[UserPayload] = Depends(user_for_generate),
):
    """Return most recent rating per card, sorted by again -> hard -> good -> easy."""
    sb = get_supabase()
    user_id = user["user_id"] if user else "00000000-0000-0000-0000-000000000001"

    result = sb.table("flashcard_reviews") \
        .select("card_index, rating, reviewed_at") \
        .eq("user_id", user_id) \
        .eq("flashcard_set_id", flashcard_set_id) \
        .order("reviewed_at", desc=True) \
        .execute()

    # Keep only most recent rating per card
    seen = set()
    latest_per_card = []
    for row in result.data:
        if row["card_index"] not in seen:
            seen.add(row["card_index"])
            latest_per_card.append(row)

    # Sort so again/hard come first
    latest_per_card.sort(key=lambda x: RATING_PRIORITY.get(x["rating"], 99))

    return {"history": latest_per_card}