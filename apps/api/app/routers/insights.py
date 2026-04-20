"""
Endpoints de leitura dos dados ingeridos.

- GET /api/clients/{slug}/meta/campaigns         → lista campanhas com métricas agregadas
- GET /api/clients/{slug}/meta/insights          → série diária por campanha
- GET /api/clients/{slug}/meta/overview          → cards KPI (spend, impressions, clicks, conv, roas, cpa)
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.client import Client
from app.models.meta import MetaCampaign, MetaInsightsDaily

router = APIRouter(prefix="/api/clients", tags=["insights"])


def _client_or_404(db: Session, slug: str) -> Client:
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "client not found")
    return c


def _window(days: int, since: str | None = None, until: str | None = None) -> tuple[date, date]:
    """Se since/until forem fornecidos, usam eles; senão calcula a partir de `days`."""
    if since and until:
        return date.fromisoformat(since), date.fromisoformat(until)
    u = date.today()
    return u - timedelta(days=days), u


@router.get("/{slug}/meta/overview")
def meta_overview(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None, description="ISO date YYYY-MM-DD — overrides days"),
    until: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    since, until = since_d, until_d  # reuso do nome nas queries abaixo
    period_days = (until_d - since_d).days + 1
    agg = (
        db.query(
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
            func.coalesce(func.sum(MetaInsightsDaily.reach), 0).label("reach"),
        )
        .filter(
            MetaInsightsDaily.client_id == c.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .one()
    )
    spend = float(agg.spend or 0)
    imps = int(agg.impressions or 0)
    clks = int(agg.clicks or 0)
    ctr = (clks / imps * 100) if imps else 0
    cpc = (spend / clks) if clks else 0
    return {
        "client": slug,
        "platform": "meta",
        "period_days": period_days,
        "since": since_d.isoformat(),
        "until": until_d.isoformat(),
        "spend": spend,
        "impressions": imps,
        "clicks": clks,
        "reach": int(agg.reach or 0),
        "ctr": round(ctr, 4),
        "cpc": round(cpc, 4),
    }


@router.get("/{slug}/meta/campaigns")
def meta_campaigns(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    since, until = since_d, until_d

    rows = (
        db.query(
            MetaCampaign.id,
            MetaCampaign.name,
            MetaCampaign.effective_status,
            MetaCampaign.objective,
            MetaCampaign.daily_budget,
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .outerjoin(
            MetaInsightsDaily,
            (MetaInsightsDaily.object_id == MetaCampaign.id)
            & (MetaInsightsDaily.level == "campaign")
            & (MetaInsightsDaily.breakdown_key == "none")
            & (MetaInsightsDaily.date >= since)
            & (MetaInsightsDaily.date <= until),
        )
        .filter(MetaCampaign.client_id == c.id)
        .group_by(MetaCampaign.id)
        .order_by(func.coalesce(func.sum(MetaInsightsDaily.spend), 0).desc())
        .all()
    )

    out = []
    for r in rows:
        spend = float(r.spend or 0)
        imps = int(r.impressions or 0)
        clks = int(r.clicks or 0)
        out.append({
            "id": r.id,
            "name": r.name,
            "effective_status": r.effective_status,
            "objective": r.objective,
            "daily_budget": float(r.daily_budget or 0),
            "spend": spend,
            "impressions": imps,
            "clicks": clks,
            "ctr": round((clks / imps * 100) if imps else 0, 4),
            "cpc": round((spend / clks) if clks else 0, 4),
        })
    return {
        "client": slug,
        "period_days": (until_d - since_d).days + 1,
        "since": since_d.isoformat(),
        "until": until_d.isoformat(),
        "campaigns": out,
    }


@router.get("/{slug}/meta/insights/daily")
def meta_insights_daily(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    since, until = since_d, until_d
    rows = (
        db.query(
            MetaInsightsDaily.date,
            func.sum(MetaInsightsDaily.spend).label("spend"),
            func.sum(MetaInsightsDaily.impressions).label("impressions"),
            func.sum(MetaInsightsDaily.clicks).label("clicks"),
        )
        .filter(
            MetaInsightsDaily.client_id == c.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .group_by(MetaInsightsDaily.date)
        .order_by(MetaInsightsDaily.date.asc())
        .all()
    )
    return {
        "client": slug,
        "period_days": (until_d - since_d).days + 1,
        "since": since_d.isoformat(),
        "until": until_d.isoformat(),
        "series": [
            {"date": r.date.isoformat(), "spend": float(r.spend or 0),
             "impressions": int(r.impressions or 0), "clicks": int(r.clicks or 0)}
            for r in rows
        ],
    }
