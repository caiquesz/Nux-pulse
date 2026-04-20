"""Endpoints de sincronização — disparar backfills e inspecionar jobs."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.crypto import decrypt
from app.core.db import SessionLocal, get_db
from app.models.client import Client
from app.models.connection import AccountConnection, Platform
from app.models.ops import SyncJob
from app.services.meta.ingest import run_backfill

router = APIRouter(prefix="/api/sync", tags=["sync"])


class BackfillRequest(BaseModel):
    days: int = 30
    level: str = "ad"  # account | campaign | adset | ad


class JobRead(BaseModel):
    id: int
    client_id: int
    platform: str
    kind: str
    status: str
    started_at: str | None
    finished_at: str | None
    window_start: str | None
    window_end: str | None
    rows_written: int
    error_message: str | None

    @classmethod
    def of(cls, j: SyncJob) -> "JobRead":
        return cls(
            id=j.id, client_id=j.client_id, platform=j.platform, kind=j.kind,
            status=j.status,
            started_at=j.started_at.isoformat() if j.started_at else None,
            finished_at=j.finished_at.isoformat() if j.finished_at else None,
            window_start=j.window_start.isoformat() if j.window_start else None,
            window_end=j.window_end.isoformat() if j.window_end else None,
            rows_written=j.rows_written,
            error_message=j.error_message,
        )


def _run_bg(client_id: int, connection_id: int, days: int, level: str) -> None:
    db = SessionLocal()
    try:
        conn = db.query(AccountConnection).filter(AccountConnection.id == connection_id).first()
        if not conn or not conn.tokens_enc:
            return
        token = decrypt(conn.tokens_enc)
        run_backfill(db, connection=conn, token=token, days=days, level=level)
    except Exception:
        pass  # erro já foi gravado em sync_jobs / account_connections
    finally:
        db.close()


@router.post("/meta/{slug}/backfill", status_code=202)
def start_backfill(slug: str, body: BackfillRequest, bg: BackgroundTasks, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "client not found")
    conn = (
        db.query(AccountConnection)
        .filter(AccountConnection.client_id == c.id, AccountConnection.platform == Platform.meta)
        .first()
    )
    if not conn:
        raise HTTPException(400, "client has no Meta connection")
    bg.add_task(_run_bg, c.id, conn.id, body.days, body.level)
    return {"accepted": True, "client": slug, "platform": "meta", "days": body.days, "level": body.level}


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(client_slug: str | None = None, limit: int = 20, db: Session = Depends(get_db)):
    q = db.query(SyncJob)
    if client_slug:
        c = db.query(Client).filter(Client.slug == client_slug).first()
        if not c:
            raise HTTPException(404, "client not found")
        q = q.filter(SyncJob.client_id == c.id)
    rows = q.order_by(SyncJob.id.desc()).limit(limit).all()
    return [JobRead.of(j) for j in rows]
