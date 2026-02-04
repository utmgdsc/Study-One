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
