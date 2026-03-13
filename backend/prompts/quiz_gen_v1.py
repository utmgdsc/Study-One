# ============================================
# QUIZ PROMPT
# ============================================

def build_quiz_generation_prompt(content: str) -> str:
    """
    Build a prompt for generating exactly 10 multiple choice questions.
    Designed for self-assessment with A/B/C/D options and related linked topic label.

    Args:
        content: raw study notes.

    Returns:
        Prompt string for Gemini.
    """
    
    user_instructions = f"Create quiz questions from these study notes:\n{content}"

    prompt = f"""You are a study assistant. Based on the following notes, generate 5-10 multiple choice questions where: 
Task: Generate 5-10 high-quality multiple-choice quiz questions to help a student learn.

Guidelines:
- Use only information from the provided notes/topic
- Do not invent facts
- Use clear, student-friendly language
- Each question has exactly 4 answer options (list of strings)
- The answer must exactly match one of the options
- Wrong answers (distractors) should be plausible, not obviously wrong

Topic labeling rules:
- Each question must have a "topic" field: a short label (2-5 words) naming the specific concept tested
- The topic must be derived from the question itself, not the notes in general
- It should be specific enough to serve as a study category

Good topic examples:
- Question "What gas do plants absorb during photosynthesis?" → topic "Gas Absorption"
- Question "Which organelle produces energy in a cell?" → topic "Cell Organelles"

Bad topic examples (avoid these):
- "Biology" (too broad)
- "Science" (not linked)
- "Study notes" (meaningless)

{user_instructions}

Notes:
{content}

Respond in this exact JSON format:
{{
    "quiz": [
        {{
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "answer": "A",
            "topic": "Specific Concept Name", 
            "correctionExplanation": "Very short, simple explanation of why A is correct and why B, C, and D are wrong."
        }}
    ]
}}

Rules:
- Output ONLY a single JSON object with a top-level "quiz" array
- Do NOT include markdown, code blocks, or any extra text
- Do NOT include ```json or ``` markers
- Generate between 5 and 10 questions
- The "answer" value must exactly match one of the strings in "options"
- Vary which option holds the correct answer — do not cluster correct answers on the first option
- Each question must have non-empty "question", "options" (exactly 4), "answer", and "topic" fields
- Each question's correctionExplanation MUST be a single 1–3 sentence paragraph that:
  - Clearly states why the correct answer is correct
  - Briefly mentions why the other options are wrong
  - Uses simple, student-friendly language
  """

    return prompt