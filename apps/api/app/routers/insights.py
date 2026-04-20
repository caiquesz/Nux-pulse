"""
Endpoints de leitura dos dados ingeridos.

- GET /api/clients/{slug}/meta/campaigns         → lista campanhas com métricas agregadas
- GET /api/clients/{slug}/meta/insights          → série diária por campanha
- GET /api/clients/{slug}/meta/overview          → cards KPI (spend, impressions, clicks, conv, roas, cpa)
"""
from datetime import date, timedelta
from decimal import Decimal

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


@router.get("/{slug}/meta/pacing")
def meta_pacing(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Pacing: budget previsto (daily_budget * dias) vs spend real por campanha.
    Só considera campanhas com `daily_budget > 0`. Status:
    - underpace: < 70% do esperado
    - on_pace: 70-130%
    - overpace: > 130%
    """
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    period_days = (until_d - since_d).days + 1

    rows = (
        db.query(
            MetaCampaign.id, MetaCampaign.name, MetaCampaign.effective_status,
            MetaCampaign.daily_budget,
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
        )
        .outerjoin(
            MetaInsightsDaily,
            (MetaInsightsDaily.object_id == MetaCampaign.id)
            & (MetaInsightsDaily.level == "campaign")
            & (MetaInsightsDaily.breakdown_key == "none")
            & (MetaInsightsDaily.date >= since_d)
            & (MetaInsightsDaily.date <= until_d),
        )
        .filter(MetaCampaign.client_id == c.id)
        .group_by(MetaCampaign.id, MetaCampaign.name, MetaCampaign.effective_status, MetaCampaign.daily_budget)
        .all()
    )

    out = []
    total_budget = Decimal(0)
    total_spend = Decimal(0)
    for r in rows:
        db_val = Decimal(r.daily_budget) if r.daily_budget is not None else Decimal(0)
        if db_val <= 0:
            continue
        expected = db_val * period_days
        spent = Decimal(r.spend or 0)
        pct = float(spent / expected * 100) if expected > 0 else 0
        status = "underpace" if pct < 70 else ("overpace" if pct > 130 else "on_pace")
        out.append({
            "campaign_id": r.id,
            "campaign_name": r.name,
            "effective_status": r.effective_status,
            "daily_budget": float(db_val),
            "expected_spend": float(expected),
            "actual_spend": float(spent),
            "percent_of_expected": round(pct, 2),
            "status": status,
        })
        total_budget += expected
        total_spend += spent

    out.sort(key=lambda r: -r["actual_spend"])
    overall_pct = float(total_spend / total_budget * 100) if total_budget > 0 else 0
    return {
        "client": slug,
        "period_days": period_days,
        "campaigns": out,
        "totals": {
            "expected_spend": float(total_budget),
            "actual_spend": float(total_spend),
            "percent_of_expected": round(overall_pct, 2),
        },
    }


@router.get("/{slug}/meta/alerts")
def meta_alerts(slug: str, db: Session = Depends(get_db)):
    """Deriva alertas das últimas 2 semanas:
    - fatigue: CTR caiu >30% na última semana vs. semana anterior (por campanha ativa)
    - cpc_spike: CPC dobrou na última semana
    - budget_underpace: spend < 50% do esperado últimos 7d
    - no_spend: campanha ATIVA sem gasto nos últimos 3 dias
    """
    c = _client_or_404(db, slug)
    today = date.today()
    last_week_start = today - timedelta(days=7)
    prev_week_start = today - timedelta(days=14)

    def window_stats(start: date, end: date) -> dict[str, dict[str, float]]:
        rows = (
            db.query(
                MetaInsightsDaily.object_id,
                func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
                func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
                func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
            )
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.level == "campaign",
                MetaInsightsDaily.breakdown_key == "none",
                MetaInsightsDaily.date >= start,
                MetaInsightsDaily.date < end,
            )
            .group_by(MetaInsightsDaily.object_id).all()
        )
        return {
            r.object_id: {
                "spend": float(r.spend or 0),
                "impressions": int(r.impressions or 0),
                "clicks": int(r.clicks or 0),
                "ctr": float(r.clicks or 0) / float(r.impressions or 0) * 100 if r.impressions else 0,
                "cpc": float(r.spend or 0) / float(r.clicks or 0) if r.clicks else 0,
            } for r in rows
        }

    last = window_stats(last_week_start, today + timedelta(days=1))
    prev = window_stats(prev_week_start, last_week_start)

    campaigns = {
        r.id: r for r in db.query(MetaCampaign).filter(
            MetaCampaign.client_id == c.id
        ).all()
    }

    alerts = []
    for cid, cmp in campaigns.items():
        l = last.get(cid, {"spend": 0, "ctr": 0, "cpc": 0, "clicks": 0})
        p = prev.get(cid, {"spend": 0, "ctr": 0, "cpc": 0, "clicks": 0})
        name = cmp.name
        status = (cmp.effective_status or "").upper()
        active = status == "ACTIVE"

        # CTR fatigue
        if p["ctr"] > 1 and l["ctr"] > 0 and l["ctr"] < p["ctr"] * 0.7:
            alerts.append({
                "severity": "warn", "kind": "fatigue",
                "campaign_id": cid, "campaign_name": name,
                "message": f"CTR caiu {(1 - l['ctr']/p['ctr'])*100:.1f}% vs. semana anterior",
                "detail": {"ctr_last": round(l['ctr'], 2), "ctr_prev": round(p['ctr'], 2)},
            })

        # CPC spike
        if p["cpc"] > 0 and l["cpc"] > p["cpc"] * 2 and l["clicks"] > 10:
            alerts.append({
                "severity": "neg", "kind": "cpc_spike",
                "campaign_id": cid, "campaign_name": name,
                "message": f"CPC subiu {(l['cpc']/p['cpc']-1)*100:.0f}% vs. semana anterior",
                "detail": {"cpc_last": round(l['cpc'], 2), "cpc_prev": round(p['cpc'], 2)},
            })

        # Underpace: active mas gasto baixo
        budget = float(cmp.daily_budget or 0)
        if active and budget > 0:
            expected_7d = budget * 7
            if l["spend"] < expected_7d * 0.5 and expected_7d > 0:
                alerts.append({
                    "severity": "warn", "kind": "underpace",
                    "campaign_id": cid, "campaign_name": name,
                    "message": f"Gastou {l['spend']/expected_7d*100:.0f}% do esperado últimos 7d",
                    "detail": {"expected_7d": round(expected_7d, 2), "actual_7d": round(l['spend'], 2)},
                })

        # No spend: active mas 0 gasto 3 dias
        if active:
            recent = (
                db.query(func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
                .filter(
                    MetaInsightsDaily.client_id == c.id,
                    MetaInsightsDaily.level == "campaign",
                    MetaInsightsDaily.breakdown_key == "none",
                    MetaInsightsDaily.object_id == cid,
                    MetaInsightsDaily.date >= today - timedelta(days=3),
                ).scalar() or 0
            )
            if float(recent) == 0 and budget > 0:
                alerts.append({
                    "severity": "neg", "kind": "no_spend",
                    "campaign_id": cid, "campaign_name": name,
                    "message": "Campanha ativa sem gasto nos últimos 3 dias",
                    "detail": {"daily_budget": budget},
                })

    # ordena: neg > warn > info
    sev_rank = {"neg": 0, "warn": 1, "info": 2}
    alerts.sort(key=lambda a: (sev_rank.get(a["severity"], 9), a["campaign_name"]))
    return {"client": slug, "generated_at": today.isoformat(), "alerts": alerts}


def _breakdown_aggregate(db: Session, client_id: int, key: str, since_d: date, until_d: date):
    """Agrega insights filtrados pelo breakdown_key, somando spend/imps/clks/actions."""
    rows = (
        db.query(
            MetaInsightsDaily.breakdown_value,
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == key,
            MetaInsightsDaily.date >= since_d,
            MetaInsightsDaily.date <= until_d,
        )
        .group_by(MetaInsightsDaily.breakdown_value)
        .order_by(func.coalesce(func.sum(MetaInsightsDaily.spend), 0).desc())
        .all()
    )
    return [
        {
            "value": r.breakdown_value or "desconhecido",
            "spend": float(r.spend or 0),
            "impressions": int(r.impressions or 0),
            "clicks": int(r.clicks or 0),
            "ctr": round(float(r.clicks or 0) / float(r.impressions or 0) * 100, 4) if r.impressions else 0,
            "cpc": round(float(r.spend or 0) / float(r.clicks or 0), 4) if r.clicks else 0,
        }
        for r in rows
    ]


@router.get("/{slug}/meta/audience")
def meta_audience(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    return {
        "client": slug,
        "period_days": (until_d - since_d).days + 1,
        "by_age": _breakdown_aggregate(db, c.id, "age", since_d, until_d),
        "by_gender": _breakdown_aggregate(db, c.id, "gender", since_d, until_d),
    }


@router.get("/{slug}/meta/geo-time")
def meta_geo_time(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days, since, until)
    return {
        "client": slug,
        "period_days": (until_d - since_d).days + 1,
        "by_region": _breakdown_aggregate(db, c.id, "region", since_d, until_d),
        "by_hour": _breakdown_aggregate(db, c.id, "hourly_stats_aggregated_by_advertiser_time_zone", since_d, until_d),
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
