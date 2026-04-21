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
from app.models.ops import SyncJob

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


# Action types canônicos.
#
# A Meta manda o MESMO evento em múltiplos action_types simultaneamente:
# uma conversa inicia pelo Ads gera "messaging_conversation_started_7d" +
# "total_messaging_connection" + "messaging_first_reply" — e somando vira
# 3× o número real. A forma correta é escolher UM canônico por métrica.
#
# Para métricas onde existem vários tipos possíveis (pixel vs CAPI vs onsite),
# usamos ordem de preferência e pegamos o primeiro que existir nos dados.

# Mensagens iniciadas — SEMPRE o tipo com janela de atribuição 7d.
MESSAGE_TYPE = "onsite_conversion.messaging_conversation_started_7d"

# Leads — "lead" agrega tudo; se não existir, cai nas variações por fonte.
LEAD_TYPES_RANKED = (
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead",
    "leadgen.other",
)

# Compras — "purchase" é agregado; senão escolhe em ordem de preferência.
PURCHASE_TYPES_RANKED = (
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase",
    "onsite_web_purchase",
)


def _pick_first(actions: dict | None, candidates: tuple[str, ...]) -> float:
    """Retorna o valor do PRIMEIRO action_type presente (em ordem de preferência).

    Evita double-counting: Meta reporta o mesmo evento sob vários rótulos
    (`lead`, `onsite_conversion.lead`, `offsite_*_leads` — todos com o mesmo
    valor), então somar = multiplicar o número real.
    """
    if not actions:
        return 0.0
    for k in candidates:
        if k in actions:
            try:
                return float(actions[k])
            except (TypeError, ValueError):
                continue
    return 0.0


def _pick_exact(actions: dict | None, key: str) -> float:
    if not actions:
        return 0.0
    v = actions.get(key)
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _aggregate_conversions(rows: list) -> dict:
    """Recebe rows com .actions e .action_values, retorna totais de messages/leads/purchases/revenue."""
    messages = leads = purchases = 0.0
    revenue = 0.0
    for r in rows:
        acts = r.actions if hasattr(r, "actions") else None
        vals = r.action_values if hasattr(r, "action_values") else None
        messages += _pick_exact(acts, MESSAGE_TYPE)
        leads += _pick_first(acts, LEAD_TYPES_RANKED)
        purchases += _pick_first(acts, PURCHASE_TYPES_RANKED)
        # revenue usa o mesmo type escolhido pra purchases
        revenue += _pick_first(vals, PURCHASE_TYPES_RANKED)
    return {
        "messages": int(round(messages)),
        "leads": int(round(leads)),
        "purchases": int(round(purchases)),
        "revenue": round(revenue, 2),
    }


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
    period_days = (until_d - since_d).days + 1

    def period_metrics(start: date, end: date) -> dict:
        """Agrega KPIs no período e retorna dict completo com conversões e custos derivados."""
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
                MetaInsightsDaily.date >= start,
                MetaInsightsDaily.date <= end,
            )
            .one()
        )
        conv_rows = (
            db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.level == "account",
                MetaInsightsDaily.breakdown_key == "none",
                MetaInsightsDaily.date >= start,
                MetaInsightsDaily.date <= end,
            )
            .all()
        )
        conv = _aggregate_conversions(conv_rows)
        sp = float(agg.spend or 0)
        im = int(agg.impressions or 0)
        ck = int(agg.clicks or 0)
        return {
            "spend": sp,
            "impressions": im,
            "clicks": ck,
            "reach": int(agg.reach or 0),
            "ctr": round((ck / im * 100) if im else 0, 4),
            "cpc": round((sp / ck) if ck else 0, 4),
            "messages": conv["messages"],
            "leads": conv["leads"],
            "purchases": conv["purchases"],
            "revenue": conv["revenue"],
            "roas": round(conv["revenue"] / sp, 4) if sp > 0 else 0.0,
            "cost_per_message": round(sp / conv["messages"], 2) if conv["messages"] else 0.0,
            "cost_per_lead": round(sp / conv["leads"], 2) if conv["leads"] else 0.0,
            "cost_per_purchase": round(sp / conv["purchases"], 2) if conv["purchases"] else 0.0,
        }

    current = period_metrics(since_d, until_d)
    # Período anterior back-to-back, mesma duração
    prev_until = since_d - timedelta(days=1)
    prev_since = prev_until - timedelta(days=period_days - 1)
    previous = period_metrics(prev_since, prev_until)

    def delta_pct(cur: float, prev: float) -> float | None:
        if prev <= 0:
            return None
        return round((cur - prev) / prev * 100, 2)

    deltas = {k: delta_pct(current[k], previous[k]) for k in (
        "spend", "impressions", "clicks", "reach", "ctr", "cpc",
        "messages", "leads", "purchases", "revenue", "roas",
        "cost_per_message", "cost_per_lead", "cost_per_purchase",
    )}

    return {
        "client": slug,
        "platform": "meta",
        "period_days": period_days,
        "since": since_d.isoformat(),
        "until": until_d.isoformat(),
        **current,
        "previous_period": {
            "since": prev_since.isoformat(),
            "until": prev_until.isoformat(),
            **previous,
        },
        "deltas": deltas,
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

    Por campanha:
    - fatigue: CTR caiu >30% na última semana vs. semana anterior
    - cpc_spike: CPC dobrou na última semana
    - underpace: spend < 50% do esperado últimos 7d
    - no_spend: campanha ATIVA sem gasto nos últimos 3 dias

    Conta inteira:
    - leads_drop / messages_drop: conversões caíram >=30% vs. semana anterior
    - budget_exceeded: spend do mês já passou do monthly_budget do cliente
    - budget_warning: spend do mês >=80% do monthly_budget (projeção perigosa)
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

    # ─── Alertas de CONTA (não atrelados a uma campanha) ─────────────────

    # Pega linhas de conversão dos dois períodos de 7d (account level).
    def _account_conv(start: date, end: date) -> dict:
        rows = (
            db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.level == "account",
                MetaInsightsDaily.breakdown_key == "none",
                MetaInsightsDaily.date >= start,
                MetaInsightsDaily.date < end,
            )
            .all()
        )
        return _aggregate_conversions(rows)

    conv_last = _account_conv(last_week_start, today + timedelta(days=1))
    conv_prev = _account_conv(prev_week_start, last_week_start)

    # Queda de leads / mensagens — só alerta se já tinha volume mínimo semana
    # anterior (>=10) pra evitar ruído em contas pequenas.
    for bucket, label in (("leads", "Leads"), ("messages", "Mensagens")):
        prev_v = conv_prev.get(bucket, 0)
        cur_v = conv_last.get(bucket, 0)
        if prev_v >= 10 and cur_v < prev_v * 0.7:
            drop_pct = (1 - cur_v / prev_v) * 100 if prev_v else 0
            alerts.append({
                "severity": "warn", "kind": f"{bucket}_drop",
                "campaign_id": "", "campaign_name": "Conta · últimos 7d",
                "message": f"{label} caíram {drop_pct:.0f}% vs. semana anterior ({prev_v} → {cur_v})",
                "detail": {"prev_7d": prev_v, "last_7d": cur_v},
            })

    # Orçamento mensal do cliente excedido — compara spend do mês corrente
    # (dia 1 → hoje) com `client.monthly_budget`.
    if c.monthly_budget and float(c.monthly_budget) > 0:
        month_start = today.replace(day=1)
        month_spend = float(
            db.query(func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.level == "account",
                MetaInsightsDaily.breakdown_key == "none",
                MetaInsightsDaily.date >= month_start,
                MetaInsightsDaily.date <= today,
            )
            .scalar() or 0
        )
        budget = float(c.monthly_budget)
        ratio = month_spend / budget if budget > 0 else 0
        if ratio >= 1.0:
            alerts.append({
                "severity": "neg", "kind": "budget_exceeded",
                "campaign_id": "", "campaign_name": "Conta · mês corrente",
                "message": f"Orçamento excedido — gastou R$ {month_spend:,.2f} de R$ {budget:,.2f} ({ratio*100:.0f}%)".replace(",", "_").replace(".", ",").replace("_", "."),
                "detail": {"spend_month": round(month_spend, 2), "monthly_budget": budget, "pct": round(ratio * 100, 1)},
            })
        elif ratio >= 0.8:
            alerts.append({
                "severity": "warn", "kind": "budget_warning",
                "campaign_id": "", "campaign_name": "Conta · mês corrente",
                "message": f"Orçamento em {ratio*100:.0f}% — R$ {month_spend:,.2f} de R$ {budget:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."),
                "detail": {"spend_month": round(month_spend, 2), "monthly_budget": budget, "pct": round(ratio * 100, 1)},
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


@router.get("/{slug}/meta/data-health")
def meta_data_health(
    slug: str,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Auditoria de confiabilidade dos dados:
    - dias sem dado no período (gaps)
    - reconciliação: soma por breakdown vs. soma sem breakdown (devem bater ±1%)
    - última sincronização
    - jobs com erro recente
    """
    c = _client_or_404(db, slug)
    since_d, until_d = _window(days)

    # 1. Gaps — dias esperados vs dias com dado
    day_rows = (
        db.query(MetaInsightsDaily.date)
        .filter(
            MetaInsightsDaily.client_id == c.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since_d,
            MetaInsightsDaily.date <= until_d,
        )
        .distinct()
        .all()
    )
    days_with_data = {r.date for r in day_rows}
    expected_days = {since_d + timedelta(days=i) for i in range((until_d - since_d).days + 1)}
    gaps = sorted(d.isoformat() for d in (expected_days - days_with_data))

    # 2. Reconciliação: soma do gasto sem breakdown vs soma por breakdown
    base = (
        db.query(func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
        .filter(
            MetaInsightsDaily.client_id == c.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since_d,
            MetaInsightsDaily.date <= until_d,
        )
        .scalar() or 0
    )
    reconciliations = []
    for bk in ("age", "gender", "region", "hourly_stats_aggregated_by_advertiser_time_zone"):
        bk_total = (
            db.query(func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.level == "account",
                MetaInsightsDaily.breakdown_key == bk,
                MetaInsightsDaily.date >= since_d,
                MetaInsightsDaily.date <= until_d,
            )
            .scalar() or 0
        )
        base_f = float(base)
        bk_f = float(bk_total)
        # diferença em %
        diff_pct = round(abs(bk_f - base_f) / base_f * 100, 3) if base_f > 0 else None
        ok = bk_f > 0 and diff_pct is not None and diff_pct < 1.0
        reconciliations.append({
            "breakdown": bk,
            "base_spend": round(base_f, 2),
            "breakdown_spend": round(bk_f, 2),
            "diff_pct": diff_pct,
            "status": "ok" if ok else ("missing" if bk_f == 0 else "drift"),
        })

    # 3. Última sync
    last_sync = (
        db.query(SyncJob)
        .filter(SyncJob.client_id == c.id, SyncJob.platform == "meta", SyncJob.status == "done")
        .order_by(SyncJob.finished_at.desc())
        .first()
    )
    recent_errors = (
        db.query(SyncJob)
        .filter(SyncJob.client_id == c.id, SyncJob.platform == "meta", SyncJob.status == "error")
        .order_by(SyncJob.id.desc())
        .limit(5)
        .all()
    )

    return {
        "client": slug,
        "window": {"since": since_d.isoformat(), "until": until_d.isoformat(), "days": days},
        "expected_days": len(expected_days),
        "days_with_data": len(days_with_data),
        "gaps": gaps,
        "reconciliations": reconciliations,
        "last_successful_sync": {
            "job_id": last_sync.id if last_sync else None,
            "finished_at": last_sync.finished_at.isoformat() if last_sync and last_sync.finished_at else None,
            "rows_written": last_sync.rows_written if last_sync else 0,
        } if last_sync else None,
        "recent_errors": [
            {"id": j.id, "error": (j.error_message or "")[:200], "when": j.started_at.isoformat() if j.started_at else None}
            for j in recent_errors
        ],
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
    # Pega rows cruas pra poder extrair actions/action_values por dia
    rows = (
        db.query(
            MetaInsightsDaily.date,
            MetaInsightsDaily.spend,
            MetaInsightsDaily.impressions,
            MetaInsightsDaily.clicks,
            MetaInsightsDaily.actions,
            MetaInsightsDaily.action_values,
        )
        .filter(
            MetaInsightsDaily.client_id == c.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .order_by(MetaInsightsDaily.date.asc())
        .all()
    )
    # como level=account tem 1 row por dia, agrupar é redundante, mas mantemos suporte caso mude
    by_day: dict[date, dict] = {}
    for r in rows:
        d = by_day.setdefault(r.date, {"spend": 0.0, "impressions": 0, "clicks": 0, "actions_rows": [], "values_rows": []})
        d["spend"] += float(r.spend or 0)
        d["impressions"] += int(r.impressions or 0)
        d["clicks"] += int(r.clicks or 0)
        d["actions_rows"].append(type("X", (), {"actions": r.actions, "action_values": r.action_values}))

    series = []
    for dt in sorted(by_day.keys()):
        b = by_day[dt]
        conv = _aggregate_conversions(b["actions_rows"])
        series.append({
            "date": dt.isoformat(),
            "spend": round(b["spend"], 2),
            "impressions": b["impressions"],
            "clicks": b["clicks"],
            "messages": conv["messages"],
            "leads": conv["leads"],
            "purchases": conv["purchases"],
            "revenue": conv["revenue"],
        })
    return {
        "client": slug,
        "period_days": (until_d - since_d).days + 1,
        "since": since_d.isoformat(),
        "until": until_d.isoformat(),
        "series": series,
    }
