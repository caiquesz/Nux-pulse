from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# Supabase pooler (PgBouncer transaction mode) não suporta prepared statements.
# prepare_threshold=None desliga o cache de prepared statements do psycopg 3,
# evitando `DuplicatePreparedStatement` quando a mesma conexão é reusada.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
