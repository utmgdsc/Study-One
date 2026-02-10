# Manual Endpoint Tests

Test the study generation endpoint before frontend integration.

## Prerequisites

1. **Backend running** with venv activated:
   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   uvicorn main:app --port 8000
   ```

2. **GEMINI_API_KEY** set in `backend/.env` or `Study-One/.env`:
   ```
   GEMINI_API_KEY=your_key_from_google_ai_studio
   ```
   Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).

## Run Tests

**PowerShell (Windows):**
```powershell
.\backend\scripts\test-generate-endpoint.ps1
```

**Bash (macOS/Linux):**
```bash
chmod +x backend/scripts/test-generate-endpoint.sh
./backend/scripts/test-generate-endpoint.sh
```

## Quick curl Examples

```bash
# Short notes
curl -X POST http://127.0.0.1:8000/api/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"Photosynthesis converts light into chemical energy."}'

# Longer notes
curl -X POST http://127.0.0.1:8000/api/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"The French Revolution was a period of radical change. Key causes included financial crisis and Enlightenment ideas. Napoleon eventually rose to power."}'

# Error: empty text (expect 422)
curl -X POST http://127.0.0.1:8000/api/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"text":""}'
```

## Bypassing Gemini Quota (Alternative: pytest)

When the Gemini API quota is exhausted, run the **integration tests** instead—they mock the API and don't use quota:

```bash
cd backend
pytest tests/test_generate_endpoint.py -v
```

These tests cover the same short/long notes scenarios as the manual script.

## Definition of Done Checklist

- [x] Endpoint tested with short notes
- [x] Endpoint tested with longer notes
- [x] Output structure is always valid JSON (when 200)
- [x] Errors return meaningful messages (422 validation, 500 with detail)
- [x] No unhandled exceptions (all errors caught and returned as HTTP responses)

Run `pytest tests/test_generate_endpoint.py -v` to verify all 6 DoD tests pass.
