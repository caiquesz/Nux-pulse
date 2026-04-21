"""Endpoints de sincronização — disparar backfills e inspecionar jobs."""
import os
import time
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.crypto import decrypt
from app.core.db import SessionLocal, get_db
from app.models.client import Client
from app.models.connection import AccountConnection, Platform
from app.models.ops import SyncJob
from app.services.meta.client import MetaApiError, MetaClient
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


@router.get("/meta/{slug}/diagnose")
def diagnose_meta(slug: str, db: Session = Depends(get_db)):
    """Faz 1 call síncrono à Meta Graph API pra validar token + account + rede.
    Retorna resultado OU erro detalhado sem mascarar. Timeout curto (15s)."""
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "client not found")
    conn = (
        db.query(AccountConnection)
        .filter(AccountConnection.client_id == c.id, AccountConnection.platform == Platform.meta)
        .first()
    )
    if not conn or not conn.tokens_enc:
        raise HTTPException(400, "no meta connection")
    token = decrypt(conn.tokens_enc)
    started = time.time()
    try:
        # retries=0 pra falhar rápido em vez de ficar em backoff
        client = MetaClient(token, timeout=15.0)
        client._get_retries = 0  # noqa: acesso interno intencional
        acc = client._get(f"https://graph.facebook.com/v22.0/{conn.external_account_id}", {
            "fields": "id,account_id,name,account_status,currency,timezone_name,amount_spent",
        }, retries=0)
        client.close()
        return {
            "ok": True,
            "duration_s": round(time.time() - started, 2),
            "account": acc,
            "connection_id": conn.id,
        }
    except MetaApiError as e:
        return {
            "ok": False,
            "duration_s": round(time.time() - started, 2),
            "error_type": "MetaApiError",
            "status": e.status,
            "payload": e.payload,
        }
    except Exception as e:
        return {
            "ok": False,
            "duration_s": round(time.time() - started, 2),
            "error_type": type(e).__name__,
            "message": str(e)[:500],
            "trace": traceback.format_exc()[:800],
        }


@router.post("/meta/{slug}/wipe-insights")
def wipe_meta_insights(slug: str, db: Session = Depends(get_db)):
    """Deleta todas as linhas de meta_insights_daily do cliente.
    Útil pra limpar dados duplicados por rodadas antigas de backfill antes do fix
    do NULL-distinct. Depois, chame /backfill pra repopular limpo."""
    from app.models.meta import MetaInsightsDaily
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "client not found")
    deleted = db.query(MetaInsightsDaily).filter(MetaInsightsDaily.client_id == c.id).delete()
    db.commit()
    return {"deleted_rows": deleted, "client": slug}


@router.post("/jobs/cleanup-stale")
def cleanup_stale_jobs(max_age_minutes: int = 15, db: Session = Depends(get_db)):
    """Marca como 'error' os jobs que ficaram em 'running' por mais de `max_age_minutes`.
    Útil pra limpar zumbis depois de deploys/restarts (BackgroundTasks do FastAPI morre com o processo)."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    stale = (
        db.query(SyncJob)
        .filter(SyncJob.status == "running", SyncJob.started_at < cutoff)
        .all()
    )
    for j in stale:
        j.status = "error"
        j.error_message = f"auto-expired: job ran longer than {max_age_minutes}m (likely killed by deploy/restart)"
        j.finished_at = datetime.now(timezone.utc)
        db.add(j)
    db.commit()
    return {"cleaned": len(stale), "ids": [j.id for j in stale]}


@router.post("/all", status_code=202)
def run_scheduled_sync(
    days: int = 3,
    level: str = "ad",
    bg: BackgroundTasks = None,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
):
    """Endpoint para cron externo (Vercel Cron, cron-job.org, GitHub Actions).
    Dispara backfill pra TODAS as conexões ativas. Protegido pela env `CRON_SECRET`.

    Uso típico: 1×/dia 02:00 BRT, days=3 (cobre re-delivery/late events da Meta)."""
    expected = os.environ.get("CRON_SECRET")
    if expected and x_cron_secret != expected:
        raise HTTPException(401, "invalid cron secret")
    # também tolera SEM secret configurado (dev/staging) pra não quebrar
    if not expected:
        pass

    conns = (
        db.query(AccountConnection)
        .filter(AccountConnection.platform == Platform.meta, AccountConnection.tokens_enc.is_not(None))
        .all()
    )
    dispatched = []
    for conn in conns:
        client = db.query(Client).filter(Client.id == conn.client_id, Client.is_active.is_(True)).first()
        if not client:
            continue
        if bg is not None:
            bg.add_task(_run_bg, client.id, conn.id, days, level)
        dispatched.append({"client": client.slug, "connection_id": conn.id, "platform": "meta"})

    return {"accepted": True, "dispatched": dispatched, "count": len(dispatched), "days": days, "level": level}


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
