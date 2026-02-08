"""
Study Material Generation Prompts (v1)
======================================
Centralized prompt engineering for generating summaries and quizzes from study notes.

Optimized for: Google Gemini API

This module provides:
- System prompts defining Gemini's role and behavior
- User prompts for generating study materials
- Output format specifications
- Examples for few-shot learning
"""

from typing import Optional, List, Dict


# ============================================
# SYSTEM PROMPT
# Defines the AI's role and general behavior
# ============================================

SYSTEM_PROMPT = """You are an expert study assistant and educational content creator.

Your task is to help students learn effectively by creating two types of study materials:

RULES:
- Use only information in the notes
- Do not invent facts
- Keep language simple and student-friendly

1. SUMMARY GENERATION:
   - Extract the most important concepts from the notes
   - Create 3-7 clear, memorable bullet points
   - Each point should be 1-2 sentences long
   - Focus on core concepts, key relationships, and important details
   - Use simple, direct language

2. QUIZ GENERATION:
   - Create 3-5 multiple-choice questions
   - Test understanding, not just memorization
   - Each question should have exactly 4 options
   - Make questions clear and unambiguous
   - Ensure incorrect options are plausible but clearly wrong
   - Avoid trick questions or overly complex wording
   - Match difficulty to the source material

IMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown formatting, no code blocks - just pure JSON."""


# ============================================
# OUTPUT FORMAT SPECIFICATION
# ============================================

OUTPUT_FORMAT = """Output format - follow exactly:

{
    "summary": ["point 1", "point 2", "point 3"],
    "quiz": [
        {
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "answer": "A"
        }
    ]
}

Rules:
- Output ONLY the JSON object above
- Do NOT include markdown, code blocks, or any text outside the JSON
- Do NOT include ```json or ``` markers
- "summary" must be an array of 3-7 strings
- "quiz" must be an array of 3-5 question objects
- Each question must have exactly 4 options
- "answer" must be one of the 4 options provided"""


# ============================================
# FEW-SHOT EXAMPLES
# Helps the model understand expected quality
# ============================================

EXAMPLES = """Here are examples of correct output format:

--- EXAMPLE 1 ---

INPUT NOTES:
"Photosynthesis is the process by which plants convert sunlight into energy. It occurs in chloroplasts and requires carbon dioxide and water. The outputs are glucose and oxygen."

CORRECT OUTPUT:
{
    "summary": [
        "Photosynthesis converts sunlight into chemical energy (glucose) in plant cells",
        "Occurs in chloroplasts and requires CO₂ and H₂O as inputs",
        "Produces glucose for plant energy and oxygen as a byproduct"
    ],
    "quiz": [
        {
            "question": "Where does photosynthesis take place in plant cells?",
            "options": ["Mitochondria", "Chloroplasts", "Nucleus", "Cell wall"],
            "answer": "Chloroplasts"
        },
        {
            "question": "Which of the following is a product of photosynthesis?",
            "options": ["Carbon dioxide", "Water", "Oxygen", "Nitrogen"],
            "answer": "Oxygen"
        },
        {
            "question": "What is the primary energy source for photosynthesis?",
            "options": ["Heat", "Sunlight", "Chemical energy", "Wind"],
            "answer": "Sunlight"
        }
    ]
}

--- EXAMPLE 2 ---

INPUT NOTES:
"The water cycle includes evaporation, condensation, and precipitation. Water evaporates from oceans and lakes, forms clouds through condensation, and returns to Earth as rain or snow."

CORRECT OUTPUT:
{
    "summary": [
        "The water cycle is a continuous process of water movement on Earth",
        "Evaporation occurs when water from oceans and lakes becomes water vapor",
        "Condensation forms clouds, and precipitation returns water to Earth's surface"
    ],
    "quiz": [
        {
            "question": "What happens during evaporation in the water cycle?",
            "options": ["Water falls as rain", "Water becomes vapor", "Clouds form", "Ice melts"],
            "answer": "Water becomes vapor"
        },
        {
            "question": "Which process forms clouds in the water cycle?",
            "options": ["Evaporation", "Precipitation", "Condensation", "Filtration"],
            "answer": "Condensation"
        },
        {
            "question": "What are the main forms of precipitation?",
            "options": ["Steam and vapor", "Rain and snow", "Clouds and fog", "Rivers and lakes"],
            "answer": "Rain and snow"
        }
    ]
}"""


# ============================================
# PROMPT BUILDERS
# ============================================

def build_study_generation_prompt(user_notes: str, include_examples: bool = True) -> str:
    """
    Build the complete prompt for study material generation with Gemini.
    
    Args:
        user_notes: The student's study notes to process
        include_examples: Whether to include few-shot examples (default: True)
    
    Returns:
        Complete prompt string optimized for Gemini
    """
    prompt_parts = [SYSTEM_PROMPT]
    
    if include_examples:
        prompt_parts.extend([
            "",
            EXAMPLES,
            "",
            "--- YOUR TASK ---"
        ])
    
    prompt_parts.extend([
        "",
        f"Process these notes and generate study materials:",
        "",
        user_notes,
        "",
        OUTPUT_FORMAT
    ])
    
    return "\n".join(prompt_parts)


def build_custom_quiz_prompt(
    user_notes: str,
    num_questions: int = 3,
    difficulty: Optional[str] = None
) -> str:
    """
    Build a customized quiz generation prompt for Gemini.
    
    Args:
        user_notes: The student's study notes
        num_questions: Number of quiz questions to generate (default: 3)
        difficulty: Optional difficulty level ("easy", "medium", "hard")
    
    Returns:
        Customized prompt for quiz generation
    """
    difficulty_instructions = ""
    if difficulty == "easy":
        difficulty_instructions = """
Difficulty: EASY
- Focus on basic recall and recognition
- Use straightforward, simple language
- Test fundamental concepts"""
    elif difficulty == "medium":
        difficulty_instructions = """
Difficulty: MEDIUM
- Test application and analysis
- Include scenario-based questions
- Require deeper understanding"""
    elif difficulty == "hard":
        difficulty_instructions = """
Difficulty: HARD
- Require synthesis and evaluation
- Use complex scenarios
- Test critical thinking and edge cases"""
    
    custom_format = f"""Output format:

{{
    "quiz": [
        {{
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "answer": "A"
        }}
    ]
}}

Rules:
- Output ONLY the JSON object
- No markdown, code blocks, or extra text
- Generate exactly {num_questions} questions
- Each question must have exactly 4 options"""
    
    prompt = f"""{SYSTEM_PROMPT}
{difficulty_instructions}

Generate a quiz with {num_questions} multiple-choice questions from these notes:

{user_notes}

{custom_format}"""
    
    return prompt


def build_summary_only_prompt(user_notes: str, num_points: int = 5) -> str:
    """
    Build a prompt for summary generation only (no quiz) for Gemini.
    
    Args:
        user_notes: The student's study notes
        num_points: Number of summary points (default: 5)
    
    Returns:
        Prompt for summary-only generation
    """
    prompt = f"""You are an expert study assistant.

Task: Create a concise summary of the following notes.

Requirements:
- Extract the {num_points} most important points
- Each point should be 1-2 sentences
- Focus on key concepts and relationships
- Use clear, simple language

Notes:
{user_notes}

Output format:

{{
    "summary": ["point 1", "point 2", "point 3", "..."]
}}

Rules:
- Output ONLY the JSON object above
- No markdown, code blocks, or extra text
- Include exactly {num_points} summary points"""
    
    return prompt


# ============================================
# VALIDATION & QUALITY CHECKS
# ============================================

def validate_quiz_quality(quiz_data: List[Dict]) -> List[str]:
    """
    Check quiz questions for common quality issues.
    
    Args:
        quiz_data: List of quiz question dictionaries
    
    Returns:
        List of warning messages (empty if no issues)
    """
    warnings = []
    
    for i, q in enumerate(quiz_data, 1):
        # Check for overly short questions
        if len(q.get("question", "")) < 10:
            warnings.append(f"Q{i}: Question seems too short")
        
        # Check for duplicate options
        options = q.get("options", [])
        if len(options) != len(set(options)):
            warnings.append(f"Q{i}: Contains duplicate options")
        
        # Check if answer exists in options
        answer = q.get("answer", "")
        if answer not in options:
            warnings.append(f"Q{i}: Answer '{answer}' not found in options")
        
        # Check for options that are too similar
        if len(options) >= 2:
            for j, opt1 in enumerate(options):
                for opt2 in options[j+1:]:
                    if opt1.lower() == opt2.lower():
                        warnings.append(f"Q{i}: Options too similar: '{opt1}' vs '{opt2}'")
    
    return warnings


# ============================================
# VERSION METADATA
# ============================================

VERSION = "1.0.0"
LAST_UPDATED = "2025-02-08"
OPTIMIZED_FOR = "Google Gemini API"
# COMPATIBLE_MODELS = ["gemini-pro", "gemini-1.5-pro", "gemini-1.5-flash"]

CHANGELOG = """
v1.0.0
- Initial prompt design optimized for Google Gemini
- Direct, imperative instructions (works better with Gemini)
- Clear input/output separation in examples
- Simplified system prompts without markdown formatting
- Strict JSON output requirements to avoid code block wrapping
- Few-shot examples with explicit INPUT/OUTPUT labels
"""