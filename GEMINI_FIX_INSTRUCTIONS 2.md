# Gemini API Fix - Setup Instructions

## What Happened?

The Study-One app was using an older Gemini model (`gemini-2.0-flash`) that has been deprecated by Google. When you try to generate study materials, you'll get a **404 error** saying the model is no longer available.

**Error message:**
```
404 This model models/gemini-2.0-flash is no longer available to new users.
Please update your code to use a newer model for the latest features and improvements.
```

## The Fix

We need to update the code to use the newer `gemini-2.5-flash` model.

### Step 1: Update the Code

Open `backend/services/gemini.py` and find line 15. Change:

```python
# OLD - Line 15
def __init__(self, model_name: str = "gemini-2.0-flash"):
```

To:

```python
# NEW - Line 15
def __init__(self, model_name: str = "gemini-2.5-flash"):
```

**That's it!** This one-line change fixes the issue.

---

## Getting the Project Running (First Time Setup)

If this is your first time running the project, follow these steps:

### Prerequisites

Make sure you have installed:
- **Python 3.12+** - Check with: `python --version`
- **Node.js 18+** - Check with: `node --version`
- **Git** - Check with: `git --version`

### 1. Clone the Repository

```bash
git clone https://github.com/utmgdsc/Study-One.git
cd Study-One
```

### 2. Install Dependencies

**Backend:**
```bash
cd backend
pip install -r requirements.txt
cd ..
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 3. Set Up Environment Variables

You need API keys from Google (Gemini) and Supabase.

#### Create `.env` at project root

Create a file called `.env` in the `Study-One` folder with:

```env
# Get from: https://aistudio.google.com/apikey
GEMINI_API_KEY="your-gemini-api-key-here"

# Supabase - Get from Dashboard → Project Settings → API
SUPABASE_URL="https://<your-project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
SUPABASE_JWT_SECRET="your-jwt-secret-here"
```

#### Create `frontend/.env.local`

Create a file called `.env.local` in the `frontend` folder with:

```env
# Supabase - Same project as backend, client-side keys
NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-here"
```

#### Where to Get Your Keys

| Key | Where to Find It |
|-----|------------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) - Click "Create API Key" |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → API Keys → service_role (secret) |
| `SUPABASE_JWT_SECRET` | Dashboard → Settings → API → JWT Settings → JWT Secret |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → API Keys → anon / publishable key |

**Note:** If you don't have a Supabase project:
1. Go to [supabase.com](https://supabase.com)
2. Sign up and create a new project
3. Wait for it to finish setting up
4. Get your keys from the dashboard

### 4. Apply the Gemini Fix

Make sure you've applied the fix from **Step 1** above (change `gemini-2.0-flash` to `gemini-2.5-flash` in `backend/services/gemini.py`).

### 5. Run the Application

Open **two terminal windows** (or use split terminals).

**Terminal 1 - Start the Backend:**
```bash
cd backend
uvicorn main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

**Terminal 2 - Start the Frontend:**
```bash
cd frontend
npm run dev
```

You should see:
```
▲ Next.js 16.1.6
- Local:   http://localhost:3000
✓ Ready in 1146ms
```

### 6. Test the Application

1. Open your browser and go to **http://localhost:3000**
2. Sign up or log in (if authentication is enabled)
3. Enter some study notes, for example:
   ```
   Photosynthesis is the process by which plants convert light energy into chemical energy.
   It occurs in the chloroplasts and requires water, carbon dioxide, and sunlight.
   The main products are glucose and oxygen.
   ```
4. Click **Generate Study Materials**
5. You should see:
   - A summary of your notes
   - Quiz questions with multiple choice answers

If you see the generated content, **the fix is working!** ✅

---

## Troubleshooting

### "404 model not available" error
- Make sure you applied the fix (change `gemini-2.0-flash` to `gemini-2.5-flash`)
- Restart the backend server after making the change

### "Invalid API key" error
- Double-check your `GEMINI_API_KEY` in the `.env` file
- Make sure there are no extra spaces or quotes
- Try regenerating your API key at [Google AI Studio](https://aistudio.google.com/apikey)

### Backend won't start
- Make sure you're in the `backend` folder when running `uvicorn main:app --reload`
- Check that all dependencies installed correctly: `pip install -r requirements.txt`

### Frontend won't start
- Make sure you're in the `frontend` folder when running `npm run dev`
- Try deleting `node_modules` and reinstalling: `rm -rf node_modules && npm install`

### "Cannot connect to backend" error
- Make sure the backend is running on http://localhost:8000
- Check that `NEXT_PUBLIC_API_URL` in `frontend/.env.local` is not set, or is set to `http://localhost:8000`

---

## Additional Notes

### Deprecation Warning

You may see this warning when starting the backend:

```
FutureWarning: All support for the `google.generativeai` package has ended.
Please switch to the `google.genai` package as soon as possible.
```

**This is okay for now.** The app will still work. However, in the future, we should migrate to the newer `google.genai` package to get continued support and updates.

### Keeping Your API Keys Secret

**IMPORTANT:** Never commit your `.env` or `.env.local` files to git! These files contain secret keys and are already in `.gitignore`. Sharing your API keys publicly can lead to:
- Unauthorized usage
- Unexpected charges on your account
- Security vulnerabilities

If you accidentally expose your keys:
1. Immediately revoke them in the respective dashboards
2. Generate new keys
3. Update your `.env` files

---

## Summary

1. **The Issue:** Old Gemini model (`gemini-2.0-flash`) is deprecated
2. **The Fix:** Update to `gemini-2.5-flash` in `backend/services/gemini.py` line 15
3. **Setup:** Install dependencies, create `.env` files with API keys, run both servers
4. **Test:** Visit http://localhost:3000 and try generating study materials

Questions? Check the main [README.md](README.md) or ask in the team chat.

Happy coding! 🚀
