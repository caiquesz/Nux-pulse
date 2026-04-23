import hmac

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.auth import require_api_key
from app.core.config import settings
from app.mcp_server import mcp
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


# ─── MCP server mount ─────────────────────────────────────────────────
# /mcp expõe tools pra Claude.ai/Desktop e outros clientes MCP.
# Protegemos por X-API-Key via middleware ASGI (não dá pra usar Depends aqui
# porque o sub-app é gerenciado pelo fastmcp e tem rotas próprias).
#
# Clientes MCP podem enviar X-API-Key como header custom. Claude Desktop
# permite configurar headers via config JSON.
class _MCPKeyAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        configured = settings.API_SECRET_KEY
        # dev: chave default libera
        if not configured or configured == "dev-secret-change-me":
            return await call_next(request)
        presented = (
            request.headers.get("x-api-key")
            or request.headers.get("authorization", "").removeprefix("Bearer ").strip()
            or None
        )
        if not presented or not hmac.compare_digest(presented, configured):
            return _unauthorized_json("Missing or invalid X-API-Key / Authorization Bearer")
        return await call_next(request)


def _unauthorized_json(detail: str):
    from starlette.responses import JSONResponse
    return JSONResponse({"error": "unauthorized", "detail": detail}, status_code=401)


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

# Monta o MCP server em /mcp (streamable-http transport). Cliente Claude Desktop
# conecta via https://nux-pulse-production.up.railway.app/mcp com X-API-Key.
_mcp_app = mcp.http_app(path="/")
_mcp_app.add_middleware(_MCPKeyAuthMiddleware)
app.mount("/mcp", _mcp_app)


@app.get("/")
def root():
    return {"service": "nux-pulse-api", "version": "0.1.0"}
