import json
import logging
import re
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from services import GeminiService, get_supabase
from middleware.auth import require_user, UserPayload, user_for_generate
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from prompts.study_gen_v1 import build_study_generation_prompt, validate_quiz_quality
from prompts.flashcard_gen_v1 import build_flashcard_generation_prompt


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


class MCQuiz(QuizQuestion):
    """
    A single quiz question with multiple choice options with a linked topic
    """
    topic: str  

class GenerateQuizResponse(BaseModel):
    """
    Response from POST /api/v1/quiz
    - quiz: Array of quiz questions with options, answers, and a linked topic
    """
    quiz: list[MCQuiz]

class AnkiRating(str, Enum):
    AGAIN = "again"
    HARD = "hard"
    GOOD = "good"
    EASY = "easy"

XP_MAP = {
    "again": 0,
    "hard": 5,
    "good": 10,
    "easy": 15,
}

class FlashcardReviewRequest(BaseModel):
    flashcard_set_id: str
    card_index: int
    rating: AnkiRating

class FlashcardReviewResponse(BaseModel):
    xp_awarded: int
    total_xp: int
    already_reviewed: bool


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
    

@app.post("/api/v1/quiz", response_model=GenerateQuizResponse)
async def generate_quiz_questions(
    request: StudyPackRequest,
    _user: UserPayload | None = Depends(user_for_generate),
):
    """Generate MC Quiz from user notes.  Auth controlled by REQUIRE_AUTH_FOR_GENERATE."""

    prompt = f"""You are a study assistant. Based on the following notes, generate 5-10 multiple choice questions where: 

Each question must have a "topic" field. The topic must:
- Be a short label (2-5 words) that names the specific concept the question is testing
- Be directly derived from the question itself, not the notes in general
- Be specific enough that it could serve as a study category for that question

For example:
- Question "What gas do plants absorb during photosynthesis?" → topic "Gas Absorption"
- Question "Which organelle produces energy in a cell?" → topic "Cell Organelles"

Bad topics (too vague, not linked to the question):
- "Biology" (too broad)
- "Science" (not linked)
- "Study notes" (meaningless)

The answer to the question must exactly match one of the options.

Notes:
{request.text}

Respond in this exact JSON format:
{{
    "quiz": [
        {{
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "answer": "A",
            "topic": "Specific Concept Name"
        }}
    ]
}}

Return ONLY valid JSON, no markdown or extra text."""

    response = await gemini_service.call_gemini(prompt)
    
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate quiz. Please try again."
        )
    
    # Parse the JSON response from Gemini
    try:
        # Clean up response if it has markdown code blocks
        cleaned = clean_response(response)
        
        data = json.loads(cleaned)
        
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
            if "topic" not in q or not q["topic"].strip():
                raise ValueError(f"Quiz item {i} missing 'topic' field")
            if q["answer"] not in q["options"]:
                raise ValueError(f"Quiz item {i} 'answer' not in 'options'")
            

            quiz_questions.append(MCQuiz(
                question=q["question"],
                options=q["options"],
                answer=q["answer"], 
                topic=q["topic"]
            ))
        
        if len(quiz_questions) < 5:
            raise ValueError(f"Expected at least 5 quiz questions, got {len(quiz_questions)}.")
        if len(quiz_questions) > 10:
            raise ValueError(f"Expected at most 10 quiz questions, got {len(quiz_questions)}")
        
        return GenerateQuizResponse(quiz=quiz_questions)
    
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

@app.post("/api/v1/flashcards/review", response_model=FlashcardReviewResponse)
async def submit_flashcard_review(
    request: FlashcardReviewRequest,
    user: UserPayload = Depends(require_user),
):
    """Record an Anki-style flashcard review and award XP."""
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

    xp = XP_MAP[request.rating.value]

    try:
        sb.table("flashcard_reviews").insert({
            "user_id": user_id,
            "flashcard_set_id": request.flashcard_set_id,
            "card_index": request.card_index,
            "rating": request.rating.value,
            "xp_awarded": xp,
        }).execute()
    except Exception as e:
        logger.warning("Failed to insert flashcard_reviews: %s", e)
        raise HTTPException(status_code=500, detail="Failed to record review. Please try again.")

    try:
        sb.table("user_activity").insert({
            "user_id": user_id,
            "activity_type": "flashcard_review",
            "xp_awarded": xp,
            "metadata": {
                "flashcard_set_id": request.flashcard_set_id,
                "card_index": request.card_index,
                "rating": request.rating.value,
            },
        }).execute()
    except Exception as e:
        logger.warning("Failed to insert user_activity: %s", e)
        # Non-fatal, review is already recorded, just log it

    if xp > 0:
        try:
            sb.rpc("increment_xp", {"p_user_id": user_id, "p_xp": xp}).execute()
        except Exception as e:
            logger.warning("Failed to increment XP: %s", e)
            # Non-fatal, don't fail the whole request over XP

    stats_result = sb.table("user_stats").select("xp_total").eq("user_id", user_id).maybe_single().execute()
    total_xp = stats_result.data["xp_total"] if stats_result.data else 0

    return FlashcardReviewResponse(xp_awarded=xp, total_xp=total_xp, already_reviewed=False)


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