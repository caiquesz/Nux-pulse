from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import clients, health, insights, project, sync

app = FastAPI(
    title="NUX Pulse API",
    version="0.1.0",
    description="Marketing analytics backend — Meta Ads + Google Ads",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(clients.router)
app.include_router(sync.router)
app.include_router(insights.router)
app.include_router(project.router)


@app.get("/")
def root():
    return {"service": "nux-pulse-api", "version": "0.1.0"}
