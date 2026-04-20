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
from app.models.meta import MetaAd, MetaAdset, MetaCampaign, MetaCreative, MetaInsightsDaily

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


@router.get("/{slug}/meta/adsets")
def meta_adsets(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    campaign_id: str | None = Query(None, description="filtra por campanha"),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    q = (
        db.query(
            MetaAdset.id,
            MetaAdset.name,
            MetaAdset.campaign_id,
            MetaAdset.status,
            MetaAdset.optimization_goal,
            MetaAdset.daily_budget,
            MetaCampaign.name.label("campaign_name"),
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .join(MetaCampaign, MetaCampaign.id == MetaAdset.campaign_id)
        .outerjoin(
            MetaInsightsDaily,
            (MetaInsightsDaily.object_id == MetaAdset.id)
            & (MetaInsightsDaily.level == "adset")
            & (MetaInsightsDaily.breakdown_key == "none")
            & (MetaInsightsDaily.date >= since_d)
            & (MetaInsightsDaily.date <= until_d),
        )
        .filter(MetaAdset.client_id == c.id)
    )
    if campaign_id:
        q = q.filter(MetaAdset.campaign_id == campaign_id)
    rows = q.group_by(
        MetaAdset.id, MetaAdset.name, MetaAdset.campaign_id, MetaAdset.status,
        MetaAdset.optimization_goal, MetaAdset.daily_budget, MetaCampaign.name
    ).order_by(func.coalesce(func.sum(MetaInsightsDaily.spend), 0).desc()).all()

    out = []
    for r in rows:
        spend = float(r.spend or 0)
        imps = int(r.impressions or 0)
        clks = int(r.clicks or 0)
        out.append({
            "id": r.id,
            "name": r.name,
            "campaign_id": r.campaign_id,
            "campaign_name": r.campaign_name,
            "status": r.status,
            "optimization_goal": r.optimization_goal,
            "daily_budget": float(r.daily_budget or 0),
            "spend": spend,
            "impressions": imps,
            "clicks": clks,
            "ctr": round((clks / imps * 100) if imps else 0, 4),
            "cpc": round((spend / clks) if clks else 0, 4),
        })
    return {"client": slug, "period_days": (until_d - since_d).days + 1, "adsets": out}


@router.get("/{slug}/meta/ads")
def meta_ads(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    q = (
        db.query(
            MetaAd.id,
            MetaAd.name,
            MetaAd.adset_id,
            MetaAd.status,
            MetaAd.creative_id,
            MetaCreative.thumb_url,
            MetaCreative.creative_type,
            MetaCreative.title.label("creative_title"),
            MetaAdset.campaign_id,
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .join(MetaAdset, MetaAdset.id == MetaAd.adset_id)
        .outerjoin(MetaCreative, MetaCreative.id == MetaAd.creative_id)
        .outerjoin(
            MetaInsightsDaily,
            (MetaInsightsDaily.object_id == MetaAd.id)
            & (MetaInsightsDaily.level == "ad")
            & (MetaInsightsDaily.breakdown_key == "none")
            & (MetaInsightsDaily.date >= since_d)
            & (MetaInsightsDaily.date <= until_d),
        )
        .filter(MetaAd.client_id == c.id)
    )
    if campaign_id:
        q = q.filter(MetaAdset.campaign_id == campaign_id)
    if adset_id:
        q = q.filter(MetaAd.adset_id == adset_id)
    rows = q.group_by(
        MetaAd.id, MetaAd.name, MetaAd.adset_id, MetaAd.status,
        MetaAd.creative_id, MetaCreative.thumb_url, MetaCreative.creative_type,
        MetaCreative.title, MetaAdset.campaign_id,
    ).order_by(func.coalesce(func.sum(MetaInsightsDaily.spend), 0).desc()).limit(limit).all()

    out = []
    for r in rows:
        spend = float(r.spend or 0)
        imps = int(r.impressions or 0)
        clks = int(r.clicks or 0)
        out.append({
            "id": r.id,
            "name": r.name,
            "adset_id": r.adset_id,
            "campaign_id": r.campaign_id,
            "status": r.status,
            "creative_id": r.creative_id,
            "thumb_url": r.thumb_url,
            "creative_type": r.creative_type,
            "creative_title": r.creative_title,
            "spend": spend,
            "impressions": imps,
            "clicks": clks,
            "ctr": round((clks / imps * 100) if imps else 0, 4),
            "cpc": round((spend / clks) if clks else 0, 4),
        })
    return {"client": slug, "period_days": (until_d - since_d).days + 1, "ads": out}


@router.get("/{slug}/meta/creatives")
def meta_creatives(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    limit: int = Query(60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Agrega performance por criativo — soma insights dos ads que usam cada criativo."""
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    rows = (
        db.query(
            MetaCreative.id,
            MetaCreative.name,
            MetaCreative.thumb_url,
            MetaCreative.creative_type,
            MetaCreative.title,
            MetaCreative.body,
            func.count(MetaAd.id.distinct()).label("ads_using"),
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .outerjoin(MetaAd, MetaAd.creative_id == MetaCreative.id)
        .outerjoin(
            MetaInsightsDaily,
            (MetaInsightsDaily.object_id == MetaAd.id)
            & (MetaInsightsDaily.level == "ad")
            & (MetaInsightsDaily.breakdown_key == "none")
            & (MetaInsightsDaily.date >= since_d)
            & (MetaInsightsDaily.date <= until_d),
        )
        .filter(MetaCreative.client_id == c.id)
        .group_by(
            MetaCreative.id, MetaCreative.name, MetaCreative.thumb_url,
            MetaCreative.creative_type, MetaCreative.title, MetaCreative.body,
        )
        .order_by(func.coalesce(func.sum(MetaInsightsDaily.spend), 0).desc())
        .limit(limit)
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
            "thumb_url": r.thumb_url,
            "creative_type": r.creative_type,
            "title": r.title,
            "body": r.body,
            "ads_using": int(r.ads_using or 0),
            "spend": spend,
            "impressions": imps,
            "clicks": clks,
            "ctr": round((clks / imps * 100) if imps else 0, 4),
            "cpc": round((spend / clks) if clks else 0, 4),
        })
    return {"client": slug, "period_days": (until_d - since_d).days + 1, "creatives": out}


# ─── Funil ──────────────────────────────────────────────────────────────
# Agregamos o campo `actions` (JSONB) das linhas de insights por action_type.
# Os action_types vêm da própria Meta — ex: link_click, landing_page_view,
# add_to_cart, initiate_checkout, purchase, lead, complete_registration.
FUNNEL_STAGES = [
    ("impressions",        "Impressões"),
    ("link_click",         "Cliques no link"),
    ("landing_page_view",  "LP views"),
    ("add_to_cart",        "Add ao carrinho"),
    ("initiate_checkout",  "Checkout iniciado"),
    ("purchase",           "Compras"),
]


@router.get("/{slug}/meta/funnel")
def meta_funnel(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    # traz todas as linhas de account pra agregar
    rows = (
        db.query(MetaInsightsDaily.impressions, MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
        .filter(
            MetaInsightsDaily.client_id == c.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since_d,
            MetaInsightsDaily.date <= until_d,
        )
        .all()
    )
    totals: dict[str, float] = {}
    totals["impressions"] = sum(int(r.impressions or 0) for r in rows)
    for r in rows:
        for k, v in (r.actions or {}).items():
            totals[k] = totals.get(k, 0) + float(v or 0)

    # monta as etapas na ordem do funil
    out = []
    prev_val = None
    for key, label in FUNNEL_STAGES:
        v = int(totals.get(key, 0) or 0)
        step = {"key": key, "label": label, "value": v, "conversion_from_prev": None}
        if prev_val and prev_val > 0:
            step["conversion_from_prev"] = round(v / prev_val * 100, 2)
        out.append(step)
        prev_val = v if v else prev_val

    # action types que vieram da Meta mas não entraram no funil padrão
    other = {k: int(v) for k, v in totals.items()
             if k != "impressions" and k not in {s[0] for s in FUNNEL_STAGES} and v}
    return {
        "client": slug,
        "period_days": (until_d - since_d).days + 1,
        "stages": out,
        "other_actions": other,
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
