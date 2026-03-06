# ============================================
# FLASHCARD PROMPT
# ============================================

def build_flashcard_generation_prompt(content: str, mode: str = "notes") -> str:
    """
    Build a prompt for generating exactly 10 Q/A flashcards.
    Designed for Anki-style review (Again / Hard / Good / Easy).

    Args:
        content: Either the raw notes or a topic name.
        mode: "notes" if content is study notes, "topic" if it's just a topic.

    Returns:
        Prompt string for Gemini.
    """
    if mode == "topic":
        user_instructions = f"Create flashcards to help a student learn the topic:\n{content}"
    else:
        user_instructions = f"Create flashcards from these study notes:\n{content}"

    prompt = f"""You are an expert study assistant.
Task: Generate exactly 10 high-quality flashcards to help a student learn.

Guidelines:
- Use only information from the provided notes/topic
- Do not invent facts
- Use clear, student-friendly language
- Each flashcard is a question and a concise answer
- Questions should test understanding, not just memorization
- Questions should vary in complexity — mix straightforward recall with 
  deeper conceptual questions, so the student can naturally rate themselves 
  using Anki-style ratings (Again / Hard / Good / Easy)

{user_instructions}

Output format (follow exactly):
{{
    "flashcards": [
        {{
            "question": "Question text?",
            "answer": "Answer text."
        }}
    ]
}}

Rules:
- Output ONLY a single JSON object with a top-level "flashcards" array
- Do NOT include markdown, code blocks, or any extra text
- Do NOT include ```json or ``` markers
- Generate EXACTLY 10 flashcards
- Each flashcard must have a non-empty "question" and "answer" string"""

    return prompt