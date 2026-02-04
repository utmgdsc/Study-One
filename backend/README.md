## Getting Started

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a virtual environment (Optional):

```bash
python -m venv venv
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate      # Windows
```

Run the server:

```bash
uvicorn main:app --reload
```

Open browser and go to [http://localhost:8000](http://localhost:8000)

## Health Check

Open browser and go to [http://localhost:8000/health](http://localhost:8000/health)
