# Socrato

Socrato is a full-stack AI study assistant that turns raw notes into concise summaries and practice questions. Socrato's goal is to help students study faster and more effectively before quizzes or exams. It has a Next.js frontend and FastAPI backend. 


---

## Project Structure

```
Study-One/
├── frontend/   → Next.js web app
├── backend/    → FastAPI server
├── shared/     → Shared type definitions (API contract)
```

Both services run locally and communicate over HTTP.

---

## .env Format

Create a `.env` file at the **project root** (`Study-One/.env`).

```env
# Backend (loaded from project root)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
# DATABASE_URL=
# JWT_SECRET=
# ENV=development

# Frontend (optional; defaults to http://localhost:8000)
NEXT_PUBLIC_API_URL=
```

The backend starts without `GEMINI_API_KEY` (e.g. for CI or running tests); the generate endpoint will return an error until the key is set.

---

## Running the Frontend Locally

1. Navigate to the frontend folder:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open your browser and go to:

   ```
   http://localhost:3000
   ```

---

## Running the Backend Locally

1. Navigate to the backend folder:

   ```bash
   cd backend
   ```

2. (Optional but recommended) Create a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate   # macOS/Linux
   venv\Scripts\activate      # Windows
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Start the server:

   ```bash
   uvicorn main:app --reload
   ```

5. Backend will be available at:

   ```
   http://localhost:8000
   ```

6. Health check endpoint:

   ```
   http://localhost:8000/health
   ```

---

## Cloning and Getting Started

Clone the repository:

```bash
git clone https://github.com/utmgdsc/Study-One.git
cd Study-One
```

From here you can run the frontend and backend independently using the instructions above.

---

## API Contract

### `POST /api/v1/generate`

Generates study materials (summary and quiz questions) from user notes.

**Request Body:**

```json
{
  "text": "string (required, non-empty)"
}
```

**Response:**

```json
{
  "summary": ["string", "string", "..."],
  "quiz": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string"
    }
  ]
}
```

**Schema Files:**

| Location | Description |
|----------|-------------|
| `shared/types.ts` | Canonical TypeScript interface definitions |
| `frontend/src/types/api.ts` | Frontend TypeScript types (mirrors shared) |
| `backend/main.py` | Pydantic models (mirrors shared contract) |

---

## Notes

- Frontend runs on port **3000**, backend on port **8000**. Run both for full functionality.
- Frontend calls the backend at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- For running backend tests, see [backend/README.md](backend/README.md#running-tests).
