from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db

router = APIRouter(tags=["system"])


@router.get("/api/health")
def health(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
