import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .routes.views import router as views_router
from .routes.api import router as api_router
from .routes.editor import router as editor_router

app = FastAPI(title="Track Editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "static")), name="static")

app.include_router(views_router)
app.include_router(api_router)
app.include_router(editor_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
