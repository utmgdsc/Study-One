## Getting Started

### 1. Create and activate virtual environment

```bash
python -m venv venv
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate      # Windows
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the server

```bash
uvicorn main:app --reload
```

Open browser and go to [http://localhost:8000](http://localhost:8000)

## Health Check

Open browser and go to [http://localhost:8000/health](http://localhost:8000/health)

## Running Tests

**Important:** Always activate the virtual environment before running tests.

```bash
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate      # Windows
```

Run unit tests:

```bash
pytest tests/ -v
```

Run simple Gemini connection test:

```bash
python tests/test_gemini_simple.py
```

Run study pack test (require Gemini API key):

```bash
python tests/test_studypack.py
```

---

## Study Generation Prompt System (v1)

The backend now uses a centralized prompt module for AI study generation.

Location:

```
backend/prompts/study_gen_v1.py
```

This module defines how Gemini transforms raw notes into:

- bullet-point summaries
- multiple-choice quiz questions


### How it connects to the API

The `/api/v1/generate` endpoint builds a prompt using:

```python
prompt = build_study_generation_prompt(request.text)
```

Then sends it to Gemini:

```python
response = await gemini_service.call_gemini(prompt)
```

The prompt module handles:

- system instructions
- output schema
- few-shot examples
- formatting rules
- quality validation


### Prompt builder functions

#### Full study pack

```python
build_study_generation_prompt(notes)
```

Returns summary + quiz.

#### Quiz only

```python
build_custom_quiz_prompt(notes, num_questions=3)
```

Generates quiz-only output.

#### Summary only

```python
build_summary_only_prompt(notes)
```

Generates summary-only output.


### Versioning

Current version:

```
study_gen_v1.py → VERSION 1.0.0
```

Future prompt improvements should create:

```
study_gen_v2.py
study_gen_v3.py
```

Never silently change v1 behavior — version prompts explicitly.


### Quality checks

After Gemini responds, quiz output is validated using:

```python
validate_quiz_quality()
```

This detects:

- duplicate options
- invalid answers
- weak question structure

Warnings are logged for debugging.


### Editing prompts safely

If you change prompt behavior:

1. Keep JSON schema identical
2. Do not change API response format
3. Test with messy notes input
4. Verify frontend still parses correctly

Breaking schema can end up breaking frontend.

---

