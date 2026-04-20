FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY . .

RUN chmod +x scripts/start.sh

# Railway/Render/Fly injetam a porta em $PORT. O start.sh respeita isso e
# roda `alembic upgrade head` antes de subir uvicorn.
EXPOSE 8000
CMD ["./scripts/start.sh"]
