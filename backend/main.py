from fastapi import FastAPI


app = FastAPI(title="Socrato")

@app.get("/")
def root():
    return {}

@app.get("/health")
def check_health():
    return {"status": "ok"}