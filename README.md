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

## Environment Variables

### Backend (`Study-One/.env`)

Create a `.env` file at the **project root**:

```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Supabase — get from Dashboard → Project Settings → API
SUPABASE_URL="https://<your-project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
SUPABASE_JWT_SECRET="your-jwt-secret"

# Require login for generate endpoints? Set to true to enforce auth.
# REQUIRE_AUTH_FOR_GENERATE=false
```

| Variable | Where to find it |
|----------|-----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → API Keys → service_role (secret) |
| `SUPABASE_JWT_SECRET` | Dashboard → Settings → API → JWT Settings → JWT Secret |
| `REQUIRE_AUTH_FOR_GENERATE` | Optional. `true` = generate endpoints require Authorization; `false` or unset = no auth (default). |

The backend starts without these keys (e.g. for CI or unit tests); the endpoints will return errors until they are set.

### Frontend (`frontend/.env.local`)

```env
# Optional; defaults to http://localhost:8000
# NEXT_PUBLIC_API_URL=http://localhost:8000

# Supabase — same project, client-side keys
NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same Project URL as backend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → API Keys → anon / publishable key |

Copy `frontend/.env.example` to `frontend/.env.local` and fill in the values.

> **Important:** `.env` files are git-ignored and must never be committed.

---

## Authentication

Supabase handles both authentication and the PostgreSQL database.

### How it works

1. **Frontend**: Users sign up / sign in via Supabase Auth (`lib/auth.ts`). The session is managed by `AuthProvider` (React context).
2. **API calls**: The frontend automatically attaches the Supabase access token as `Authorization: Bearer <token>` on every request.
3. **Backend**: A JWT middleware (`middleware/auth.py`) verifies the token using the shared `SUPABASE_JWT_SECRET` and extracts `user_id`.
4. **Protected routes**: All generate endpoints and `/api/v1/me` require a valid JWT. Unauthenticated requests receive `401`.

### Testing the auth flow

```bash
# 1. Sign up a user (via Supabase dashboard or frontend)

# 2. Get a valid access token (after sign-in, check browser DevTools → Application → Local Storage)

# 3. Call the protected /me endpoint
curl http://localhost:8000/api/v1/me \
  -H "Authorization: Bearer <access_token>"

# Expected: {"user_id": "...", "email": "...", "role": "authenticated"}

# 4. Call without a token → 401
curl http://localhost:8000/api/v1/me
# Expected: {"detail": "Missing Authorization header"}
```

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

All protected endpoints require `Authorization: Bearer <token>`.

### `GET /api/v1/me`

Returns the authenticated user's identity.

**Response:**

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "role": "authenticated"
}
```

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

### `GET /health`

Health check (no auth required).

**Response:** `{"status": "ok"}`

### Schema Files

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
