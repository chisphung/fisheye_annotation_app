import os
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")


@router.get("/", response_class=HTMLResponse)
def get_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            return f.read()
    return "<h1>Frontend not found</h1>"
