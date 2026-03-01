import json
import logging
import re
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from services import GeminiService
from middleware.auth import require_user, UserPayload, user_for_generate
from typing import List, Optional

logger = logging.getLogger(__name__)

# Import the new prompt system
from prompts.study_gen_v1 import (
    build_study_generation_prompt,
    validate_quiz_quality
)


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
            answer=q["answer"]
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

    prompt = f"""You are a study assistant. Based on the following notes, generate, 5-10 multiple choice questions where: 

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
            if "topic" not in q:
                raise ValueError(f"Quiz item {i} missing 'topic' field")
            


            quiz_questions.append(MCQuiz(
                question=q["question"],
                options=q["options"],
                answer=q["answer"], 
                topic=q["topic"]
            ))
        
        if len(quiz_questions) < 5:
            raise ValueError(f"Expected at least 5 quiz questions, got {len(quiz_questions)}")
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
