from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.auth import require_api_key
from app.core.config import settings
from app.routers import clients, conversions, health, insights, project, sync

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

# `health` fica aberto (usado por Railway health-checks e debug externo).
# Todos os outros routers exigem X-API-Key. Em dev (API_SECRET_KEY=default),
# `require_api_key` libera sem header — ver app/core/auth.py.
app.include_router(health.router)
_protected = [Depends(require_api_key)]
app.include_router(clients.router, dependencies=_protected)
app.include_router(sync.router, dependencies=_protected)
app.include_router(insights.router, dependencies=_protected)
app.include_router(project.router, dependencies=_protected)
app.include_router(conversions.router, dependencies=_protected)


@app.get("/")
def root():
    return {"service": "nux-pulse-api", "version": "0.1.0"}
