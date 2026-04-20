#!/usr/bin/env bash
# Entrypoint do container em produção (Railway, Fly, Render).
# Roda migrations e sobe uvicorn na porta que o host injeta em $PORT (fallback 8000).
set -euo pipefail

cd /app

echo "→ alembic upgrade head"
alembic upgrade head

echo "→ uvicorn app.main:app (port=${PORT:-8000})"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
