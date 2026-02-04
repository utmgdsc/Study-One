from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

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
        import json
        # Clean up response if it has markdown code blocks
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]  # Remove first line
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]  # Remove last ```
        cleaned = cleaned.strip()
        
        data = json.loads(cleaned)
        
        return GenerateResponse(
            summary=data.get("summary", []),
            quiz=[
                QuizQuestion(
                    question=q["question"],
                    options=q["options"],
                    answer=q["answer"]
                )
                for q in data.get("quiz", [])
            ]
        )
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"[generate] Failed to parse Gemini response: {e}")
        print(f"[generate] Raw response: {response}")
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI response. Please try again."
        )
