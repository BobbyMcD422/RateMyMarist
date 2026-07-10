from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.db import init_db
from backend.routers import admin, rmp, sections


app = FastAPI(title="Course Directory API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    print(f"Using database: {settings.masked_database_url()}")
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(sections.router)
app.include_router(admin.router)
app.include_router(rmp.router)
