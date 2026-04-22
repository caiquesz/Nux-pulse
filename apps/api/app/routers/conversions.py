"""CRUD de conversoes manuais."""
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.client import Client
from app.models.conversions import ManualConversion
from app.models.project import TeamMember
from app.schemas.conversions import (
    ManualConversionCreate,
    ManualConversionRead,
    ManualConversionUpdate,
)


router = APIRouter(tags=["conversions"])


def _client_or_404(db: Session, slug: str) -> Client:
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "client not found")
    return c


def _to_read(db: Session, m: ManualConversion) -> ManualConversionRead:
    name = None
    if m.created_by_id:
        mem = db.query(TeamMember).filter(TeamMember.id == m.created_by_id).first()
        name = mem.name if mem else None
    return ManualConversionRead(
        id=m.id, client_id=m.client_id, date=m.date,
        kind=m.kind, count=m.count, revenue=m.revenue,
        campaign_id=m.campaign_id, campaign_name=m.campaign_name,
        notes=m.notes, created_by_id=m.created_by_id,
        created_by_name=name, created_at=m.created_at,
    )


@router.get("/api/clients/{slug}/manual-conversions", response_model=list[ManualConversionRead])
def list_manual_conversions(
    slug: str,
    since: str | None = Query(None, description="YYYY-MM-DD"),
    until: str | None = Query(None, description="YYYY-MM-DD"),
    kind: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    q = db.query(ManualConversion).filter(ManualConversion.client_id == c.id)
    if since:
        q = q.filter(ManualConversion.date >= _date.fromisoformat(since))
    if until:
        q = q.filter(ManualConversion.date <= _date.fromisoformat(until))
    if kind:
        q = q.filter(ManualConversion.kind == kind)
    rows = q.order_by(ManualConversion.date.desc(), ManualConversion.id.desc()).all()
    return [_to_read(db, r) for r in rows]


@router.post("/api/clients/{slug}/manual-conversions", response_model=ManualConversionRead, status_code=201)
def create_manual_conversion(slug: str, payload: ManualConversionCreate, db: Session = Depends(get_db)):
    c = _client_or_404(db, slug)
    m = ManualConversion(client_id=c.id, **payload.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return _to_read(db, m)


@router.patch("/api/manual-conversions/{mid}", response_model=ManualConversionRead)
def update_manual_conversion(mid: int, payload: ManualConversionUpdate, db: Session = Depends(get_db)):
    m = db.query(ManualConversion).filter(ManualConversion.id == mid).first()
    if not m:
        raise HTTPException(404, "not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.add(m); db.commit(); db.refresh(m)
    return _to_read(db, m)


@router.delete("/api/manual-conversions/{mid}", status_code=204)
def delete_manual_conversion(mid: int, db: Session = Depends(get_db)):
    m = db.query(ManualConversion).filter(ManualConversion.id == mid).first()
    if not m:
        raise HTTPException(404, "not found")
    db.delete(m); db.commit()


# ════════════════════════════════════════════════════════════════════════════
#  HELPERS reutilizados pelo insights router pra mesclar manuais no overview
# ════════════════════════════════════════════════════════════════════════════

def aggregate_manuals(db: Session, client_id: int, start: _date, end: _date) -> dict:
    """Agrega conversoes manuais do cliente no periodo.

    Retorna dict com as mesmas chaves que _aggregate_conversions dos insights:
    messages, leads, purchases (inteiros) e revenue (float).
    """
    rows = (
        db.query(
            ManualConversion.kind,
            func.coalesce(func.sum(ManualConversion.count), 0).label("count_sum"),
            func.coalesce(func.sum(ManualConversion.revenue), 0).label("rev_sum"),
        )
        .filter(
            ManualConversion.client_id == client_id,
            ManualConversion.date >= start,
            ManualConversion.date <= end,
        )
        .group_by(ManualConversion.kind)
        .all()
    )
    out = {"messages": 0, "leads": 0, "purchases": 0, "revenue": 0.0}
    for r in rows:
        if r.kind == "purchase":
            out["purchases"] = int(r.count_sum or 0)
            out["revenue"] = round(float(r.rev_sum or 0), 2)
        elif r.kind == "lead":
            out["leads"] = int(r.count_sum or 0)
        elif r.kind == "message":
            out["messages"] = int(r.count_sum or 0)
    return out


def daily_manuals_by_date(db: Session, client_id: int, start: _date, end: _date) -> dict:
    """Retorna dict { 'YYYY-MM-DD': {messages, leads, purchases, revenue} }."""
    rows = (
        db.query(
            ManualConversion.date,
            ManualConversion.kind,
            func.coalesce(func.sum(ManualConversion.count), 0).label("c"),
            func.coalesce(func.sum(ManualConversion.revenue), 0).label("r"),
        )
        .filter(
            ManualConversion.client_id == client_id,
            ManualConversion.date >= start,
            ManualConversion.date <= end,
        )
        .group_by(ManualConversion.date, ManualConversion.kind)
        .all()
    )
    by_day: dict[str, dict] = {}
    for r in rows:
        key = r.date.isoformat()
        day = by_day.setdefault(key, {"messages": 0, "leads": 0, "purchases": 0, "revenue": 0.0})
        if r.kind == "purchase":
            day["purchases"] = int(r.c or 0)
            day["revenue"] = round(float(r.r or 0), 2)
        elif r.kind == "lead":
            day["leads"] = int(r.c or 0)
        elif r.kind == "message":
            day["messages"] = int(r.c or 0)
    return by_day
