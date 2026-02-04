# Socrato

Socrato is a full-stack AI study assistant that turns raw notes into concise summaries and practice questions. Socrato's goal is to help students study faster and more effectively before quizzes or exams. It has a Next.js frontend and FastAPI backend. 


---

## Project Structure

```
Study-One/
├── frontend/   → Next.js web app
├── backend/    → FastAPI server
```

Both services run locally and communicate over HTTP.

---

## .env Format

```env
# Backend
DATABASE_URL=
JWT_SECRET=
ENV=development
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Frontend
NEXT_PUBLIC_API_URL=
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

## Notes

- Frontend runs on port **3000**
- Backend runs on port **8000**
- Make sure both are running for full functionality
