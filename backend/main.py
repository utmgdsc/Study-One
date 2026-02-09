import json
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import List, Optional
from services import GeminiService


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
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v


class QuizQuestion(BaseModel):
    """A single quiz question with multiple choice options"""
    question: str
    options: list[str]
    answer: str


class GenerateResponse(BaseModel):
    """
    Response from POST /api/v1/generate
    - summary: Array of bullet point summaries
    - quiz: Array of quiz questions with options and answers
    """
    summary: list[str]
    quiz: list[QuizQuestion]


# ============================================
# STUDY PACK REQUESTS
# ============================================

class StudyPackRequest(BaseModel):
    """
    Request body for POST /generate-study-pack
    - text: The user's study notes to process
    """
    text: str
    
    @field_validator('text')
    @classmethod
    def validate_text(cls, v: str) -> str:
        # do not include whitespace
        stripped = v.strip()
        # validate emptiness
        if not v or not stripped:
            raise ValueError("text must not be empty")
        # validate length
        if len(stripped) < 10:
            raise ValueError(f"text must not be less than 10 characters")
        if len(stripped) > 10000:
            raise ValueError("text must not be more than 10000 characters")
        return v


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


@app.post("/api/v1/generate", response_model=GenerateResponse)
async def generate_study_materials(request: GenerateRequest):
    """
    Generate study materials from user notes.
    
    Request body:
        - text (string): The user's study notes to process
    
    Returns:
        - summary (string[]): Array of bullet point summaries
        - quiz (QuizQuestion[]): Array of quiz questions
    """
    # Call Gemini to generate study materials
    prompt = f"""You are a study assistant. Based on the following notes, generate:
1. A summary as a list of bullet points (3-5 key points)
2. A quiz with 3 multiple choice questions

Notes:
{request.text}

Respond in this exact JSON format:
{{
    "summary": ["point 1", "point 2", "point 3"],
    "quiz": [
        {{
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "answer": "A"
        }}
    ]
}}

Return ONLY valid JSON, no markdown or extra text."""

    response = await gemini_service.call_gemini(prompt)
    
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate study materials. Please try again."
        )
    
    # Parse the JSON response from Gemini
    try:
        # Clean up response if it has markdown code blocks
        cleaned = response.strip()
        
        # Remove opening markdown code fence (e.g., ```json or ```)
        if cleaned.startswith("```"):
            if "\n" in cleaned:
                # Normal case: ```json\n{...}
                cleaned = cleaned.split("\n", 1)[1]
            else:
                # Edge case: no newline, just remove the backticks
                cleaned = cleaned[3:]
        
        # Remove closing markdown code fence
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        
        cleaned = cleaned.strip()
        
        data = json.loads(cleaned)
        
        quiz_questions = validate_data(data)
        
        return GenerateResponse(
            summary=data.get("summary", []),
            quiz=quiz_questions
        )
    except json.JSONDecodeError as e:
        print(f"[generate] Failed to parse JSON: {e}")
        print(f"[generate] Raw response: {response}")
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response as JSON. Please try again."
        )
    except (KeyError, TypeError, ValueError) as e:
        print(f"[generate] Invalid response structure: {e}")
        print(f"[generate] Raw response: {response}")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid AI response format: {str(e)}"
        )


# ============================================
# STUDY PACK ROUTE
# ============================================


@app.post("/generate-study-pack", response_model=GenerateResponse)
async def generate_study_pack(request: StudyPackRequest):
    """
    Generate a study pack from user notes.
    
    Request:
        - text: The user's study notes to process
    
    Returns:
        - summary: list of bullet points summarizing the text
        - quiz: list of quiz questions
    """

    prompt = f"""You are a study assistant. Based on the following notes, generate:
1. A summary as a list of bullet points (3-5 key points)
2. A quiz with 3 multiple choice questions

Notes:
{request.text}

Respond in this exact JSON format:
{{
    "summary": ["point 1", "point 2", "point 3"],
    "quiz": [
        {{
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "answer": "A"
        }}
    ]
}}

Return ONLY valid JSON, no markdown or extra text."""
           
    # Call Gemini API
    response = await gemini_service.call_gemini(prompt)
    
    if response is None:
        raise HTTPException(
            status_code=500,
            detail="Gemini API is unavailable. Please ensure GEMINI_API_KEY is set in .env file."
        )
        
    try:
        # Clean up response if it has markdown code blocks
        cleaned = clean_response(response)
        
        data = json.loads(cleaned)
        
        # Validate required fields exist
        quiz_questions = validate_data(data)
        
        return GenerateResponse(
            summary=data['summary'],
            quiz=quiz_questions
        )
    
    except json.JSONDecodeError as e:
        print(f"[generate-study-pack] Failed to parse JSON: {e}")
        print(f"[generate-study-pack] Raw response: {response}")
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response as JSON. Please try again."
        )
    except (KeyError, TypeError, ValueError) as e:
        print(f"[generate-study-pack] Invalid response structure: {e}")
        print(f"[generate-study-pack] Raw response: {response}")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid AI response format: {str(e)}"
        )