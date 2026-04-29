"""Endpoints do Command Center — overview de portfolio + cron de scoring.

PLANO_COMMAND_CENTER.md §5 e §6.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.client import Client
from app.models.meta import MetaInsightsDaily
from app.models.niche import Niche
from app.models.ops import Alert
from app.models.scoring import NicheBenchmark
from app.routers.conversions import aggregate_manuals
from app.routers.insights import _aggregate_conversions
from app.services.scoring.engine import iso_week_start, run_for_all


_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["portfolio"])


def _resolve_period(period: str | None, since: str | None, until: str | None) -> tuple[date, date, str]:
    """Mapeia o param period (7d|30d|90d|mtd|ytd|custom) pra (since, until, label).

    custom requer since e until. Default = 30d.
    """
    today = date.today()
    if since and until:
        return date.fromisoformat(since), date.fromisoformat(until), "custom"
    p = (period or "30d").lower()
    if p == "7d":
        return today - timedelta(days=6), today, "7d"
    if p == "30d":
        return today - timedelta(days=29), today, "30d"
    if p == "90d":
        return today - timedelta(days=89), today, "90d"
    if p == "mtd":
        return date(today.year, today.month, 1), today, "mtd"
    if p == "ytd":
        return date(today.year, 1, 1), today, "ytd"
    # fallback
    return today - timedelta(days=29), today, "30d"


def _client_window_metrics(db: Session, client_id: int, since: date, until: date) -> dict:
    """Spend + revenue agregados na janela. Retorna spend, revenue, roas."""
    spend = float(
        db.query(func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .scalar() or 0
    )
    conv_rows = (
        db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .all()
    )
    api_conv = _aggregate_conversions(conv_rows)
    manual = aggregate_manuals(db, client_id, since, until)

    # Smart fallback (espelha logica do Overview frontend) — escolhe UMA fonte
    # de revenue por cliente em vez de somar (que dobrava-contava quando Pixel
    # CAPI + Trackcore disparam pra mesma venda).
    #   - Trackcore confiavel quando: cobre >= 40% do Pixel OU Pixel < R$ 100
    #     (sem Pixel forte pra contradizer)
    #   - Senao usa Pixel (Trackcore eh parcial — caso classico Comtex onde so
    #     1 de 4 vendas chegou via webhook)
    pixel_revenue = float(api_conv["revenue"])
    trackcore_revenue = float(manual["revenue"])
    coverage = trackcore_revenue / pixel_revenue if pixel_revenue > 0 else 0
    trackcore_reliable = trackcore_revenue > 0 and (coverage >= 0.4 or pixel_revenue < 100)
    revenue = round(trackcore_revenue if trackcore_reliable else pixel_revenue, 2)

    return {
        "spend": round(spend, 2),
        "revenue": revenue,
        "roas": round(revenue / spend, 2) if spend > 0 else None,
    }


def _client_daily_series(db: Session, client_id: int, since: date, until: date) -> list[dict]:
    """Serie diaria (spend, revenue) pra alimentar sparklines.

    Pra cada dia da janela, soma spend e revenue (incluindo manual_conversions).
    Dias sem dado retornam 0.
    """
    spend_rows = (
        db.query(MetaInsightsDaily.date, func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .group_by(MetaInsightsDaily.date)
        .all()
    )
    spend_by_date: dict[date, float] = {d: float(s or 0) for d, s in spend_rows}

    conv_rows = (
        db.query(MetaInsightsDaily.date, MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .all()
    )
    api_revenue_by_date: dict[date, float] = {}
    for d, acts, vals in conv_rows:
        # Reusa _aggregate_conversions com 1 row tipada
        class _R: pass
        r = _R(); r.actions = acts; r.action_values = vals
        out = _aggregate_conversions([r])
        api_revenue_by_date[d] = api_revenue_by_date.get(d, 0.0) + out["revenue"]

    # Manual conversions agregadas por dia
    from app.models.conversions import ManualConversion
    manual_rows = (
        db.query(
            ManualConversion.date,
            func.coalesce(func.sum(ManualConversion.revenue), 0).label("rev"),
        )
        .filter(
            ManualConversion.client_id == client_id,
            ManualConversion.kind == "purchase",
            ManualConversion.date >= since,
            ManualConversion.date <= until,
        )
        .group_by(ManualConversion.date)
        .all()
    )
    manual_revenue_by_date: dict[date, float] = {d: float(r or 0) for d, r in manual_rows}

    # Smart fallback (mesma logica do _client_window_metrics) — escolhe UMA
    # fonte de revenue pra janela inteira em vez de somar daily. Se Trackcore
    # eh confiavel no agregado, daily usa so manual; senao usa so pixel.
    pixel_total = sum(api_revenue_by_date.values())
    manual_total = sum(manual_revenue_by_date.values())
    coverage = manual_total / pixel_total if pixel_total > 0 else 0
    use_manual = manual_total > 0 and (coverage >= 0.4 or pixel_total < 100)
    revenue_source = manual_revenue_by_date if use_manual else api_revenue_by_date

    out: list[dict] = []
    cur = since
    while cur <= until:
        out.append({
            "date": cur.isoformat(),
            "spend": round(spend_by_date.get(cur, 0.0), 2),
            "revenue": round(revenue_source.get(cur, 0.0), 2),
        })
        cur += timedelta(days=1)
    return out


@router.get("/portfolio/overview")
def portfolio_overview(
    period: str | None = None,
    since: str | None = None,
    until: str | None = None,
    db: Session = Depends(get_db),
):
    """Agregacao para a home do Command Center.

    Query params:
      ?period=7d|30d|90d|mtd|ytd  (default 30d)
      ?since=YYYY-MM-DD&until=YYYY-MM-DD  (custom range, sobrescreve period)

    Retorna:
    - period: { since, until, label }
    - kpis: portfolio-level no periodo (spend, revenue, roas, alerts, etc)
    - daily_series: agregado portfolio-wide diario (sparkline-ready)
    - tier_breakdown: { S, A, B, C, D, none } -> count
    - clients: lista detalhada com metricas do periodo + serie diaria por cliente
    """
    today = date.today()
    p_since, p_until, p_label = _resolve_period(period, since, until)

    clients = db.query(Client).filter(Client.is_active.is_(True)).order_by(Client.name).all()

    tier_breakdown = {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0, "none": 0}
    deltas: list[int] = []

    portfolio_spend = 0.0
    portfolio_revenue = 0.0
    portfolio_daily: dict[str, dict[str, float]] = {}
    clients_payload = []

    for c in clients:
        tier_breakdown[c.tier_current or "none"] = tier_breakdown.get(c.tier_current or "none", 0) + 1

        m = _client_window_metrics(db, c.id, p_since, p_until)
        daily = _client_daily_series(db, c.id, p_since, p_until)
        portfolio_spend += m["spend"]
        portfolio_revenue += m["revenue"]

        for d in daily:
            agg = portfolio_daily.setdefault(d["date"], {"spend": 0.0, "revenue": 0.0})
            agg["spend"] += d["spend"]
            agg["revenue"] += d["revenue"]

        # alertas abertos por severidade
        alert_counts = (
            db.query(Alert.severity, func.count(Alert.id))
            .filter(
                Alert.client_id == c.id,
                Alert.resolved_at.is_(None),
                Alert.dismissed.is_(False),
            )
            .group_by(Alert.severity)
            .all()
        )
        alerts = {"neg": 0, "warn": 0, "info": 0, "pos": 0}
        for sev, cnt in alert_counts:
            alerts[sev] = cnt

        last_sync = (
            db.query(func.max(MetaInsightsDaily.date))
            .filter(MetaInsightsDaily.client_id == c.id)
            .scalar()
        )

        from app.models.scoring import ClientScore
        last_score = (
            db.query(ClientScore)
            .filter(ClientScore.client_id == c.id)
            .order_by(ClientScore.period_start.desc())
            .first()
        )
        delta = last_score.delta_vs_prev if last_score else None
        if delta is not None:
            deltas.append(delta)

        clients_payload.append({
            "slug": c.slug,
            "name": c.name,
            "niche_code": c.niche_code,
            "accent_color": c.accent_color,
            "tier": c.tier_current,
            "score": c.score_current,
            "delta_vs_prev": delta,
            "score_updated_at": c.score_updated_at.isoformat() if c.score_updated_at else None,
            "monthly_budget": float(c.monthly_budget) if c.monthly_budget else None,
            "monthly_revenue_goal": float(c.monthly_revenue_goal) if c.monthly_revenue_goal else None,
            "spend": m["spend"],
            "revenue": m["revenue"],
            "roas": m["roas"],
            "daily_series": daily,
            "last_sync_date": last_sync.isoformat() if last_sync else None,
            "alerts": alerts,
        })

    portfolio_roas = round(portfolio_revenue / portfolio_spend, 2) if portfolio_spend > 0 else 0
    sa_count = tier_breakdown["S"] + tier_breakdown["A"]
    pct_sa = round(sa_count / len(clients) * 100, 1) if clients else 0
    avg_delta = round(sum(deltas) / len(deltas), 1) if deltas else None

    crit_alerts = (
        db.query(func.count(Alert.id))
        .filter(
            Alert.severity == "neg",
            Alert.resolved_at.is_(None),
            Alert.dismissed.is_(False),
        )
        .scalar() or 0
    )

    # Serializa serie agregada do portfolio em ordem cronologica
    daily_series_sorted = [
        {
            "date": d,
            "spend": round(portfolio_daily[d]["spend"], 2),
            "revenue": round(portfolio_daily[d]["revenue"], 2),
        }
        for d in sorted(portfolio_daily.keys())
    ]

    return {
        "as_of": today.isoformat(),
        "period": {
            "since": p_since.isoformat(),
            "until": p_until.isoformat(),
            "label": p_label,
            "days": (p_until - p_since).days + 1,
        },
        "kpis": {
            "active_clients": len(clients),
            "portfolio_spend": round(portfolio_spend, 2),
            "portfolio_revenue": round(portfolio_revenue, 2),
            "portfolio_roas": portfolio_roas,
            "pct_sa": pct_sa,
            "critical_alerts": crit_alerts,
            "avg_delta_7d": avg_delta,
        },
        "tier_breakdown": tier_breakdown,
        "daily_series": daily_series_sorted,
        "clients": clients_payload,
    }


@router.get("/portfolio/by-niche")
def portfolio_by_niche(
    period: str | None = None,
    since: str | None = None,
    until: str | None = None,
    db: Session = Depends(get_db),
):
    """Agrega metricas do portfolio por nicho.

    Retorna lista ordenada por spend total desc:
      { code, name, n_clients, spend, revenue, roas, avg_score, daily_series }
    Plus totais 'all' agregados de todo o portfolio (linha de referencia).
    """
    p_since, p_until, p_label = _resolve_period(period, since, until)

    # carrega niches + clientes ativos
    niches = db.query(Niche).all()
    niche_map = {n.code: n for n in niches}
    clients = db.query(Client).filter(Client.is_active.is_(True)).all()

    # group clients by niche_code
    by_niche: dict[str | None, list[Client]] = {}
    for c in clients:
        by_niche.setdefault(c.niche_code, []).append(c)

    rows = []
    portfolio_spend = 0.0
    portfolio_revenue = 0.0
    portfolio_daily: dict[str, dict[str, float]] = {}

    for niche_code, niche_clients in by_niche.items():
        spend_total = 0.0
        revenue_total = 0.0
        scores: list[int] = []
        agg_daily: dict[str, dict[str, float]] = {}

        for c in niche_clients:
            m = _client_window_metrics(db, c.id, p_since, p_until)
            spend_total += m["spend"]
            revenue_total += m["revenue"]
            if c.score_current is not None:
                scores.append(c.score_current)

            daily = _client_daily_series(db, c.id, p_since, p_until)
            for d in daily:
                agg = agg_daily.setdefault(d["date"], {"spend": 0.0, "revenue": 0.0})
                agg["spend"] += d["spend"]
                agg["revenue"] += d["revenue"]
                # acumula no portfolio total tambem
                ptotal = portfolio_daily.setdefault(d["date"], {"spend": 0.0, "revenue": 0.0})
                ptotal["spend"] += d["spend"]
                ptotal["revenue"] += d["revenue"]

        portfolio_spend += spend_total
        portfolio_revenue += revenue_total

        niche_obj = niche_map.get(niche_code) if niche_code else None
        rows.append({
            "code": niche_code,
            "name": niche_obj.name if niche_obj else (niche_code or "Sem nicho"),
            "n_clients": len(niche_clients),
            "client_slugs": [c.slug for c in niche_clients],
            "spend": round(spend_total, 2),
            "revenue": round(revenue_total, 2),
            "roas": round(revenue_total / spend_total, 2) if spend_total > 0 else None,
            "avg_score": round(sum(scores) / len(scores)) if scores else None,
            "daily_series": [
                {
                    "date": d,
                    "spend": round(agg_daily[d]["spend"], 2),
                    "revenue": round(agg_daily[d]["revenue"], 2),
                }
                for d in sorted(agg_daily.keys())
            ],
        })

    # ordena por spend desc
    rows.sort(key=lambda r: r["spend"], reverse=True)

    # max value pra alimentar mini-bars no UI
    max_spend = max((r["spend"] for r in rows), default=0)
    max_revenue = max((r["revenue"] for r in rows), default=0)

    portfolio_daily_sorted = [
        {
            "date": d,
            "spend": round(portfolio_daily[d]["spend"], 2),
            "revenue": round(portfolio_daily[d]["revenue"], 2),
        }
        for d in sorted(portfolio_daily.keys())
    ]

    return {
        "period": {
            "since": p_since.isoformat(),
            "until": p_until.isoformat(),
            "label": p_label,
            "days": (p_until - p_since).days + 1,
        },
        "totals": {
            "n_clients": len(clients),
            "n_niches": len(rows),
            "spend": round(portfolio_spend, 2),
            "revenue": round(portfolio_revenue, 2),
            "roas": round(portfolio_revenue / portfolio_spend, 2) if portfolio_spend > 0 else None,
            "max_spend": max_spend,
            "max_revenue": max_revenue,
            "daily_series": portfolio_daily_sorted,
        },
        "niches": rows,
    }


@router.get("/portfolio/by-category")
def portfolio_by_category(
    db: Session = Depends(get_db),
):
    """Agrega scores por categoria de servico, com breakdown por nicho.

    Le o snapshot mais recente de client_category_scores pra cada cliente.
    Calcula:
      - avg_overall por categoria: media simples entre todos os clientes ativos
      - by_niche: dict[niche_code, avg_score] pra cada categoria

    Util pra heatmap nicho x categoria + ranking de pontos fortes/fracos.
    """
    from app.models.scoring import ClientCategoryScore, ServiceCategory

    cats = db.query(ServiceCategory).order_by(ServiceCategory.id).all()
    clients = db.query(Client).filter(Client.is_active.is_(True)).all()
    if not cats or not clients:
        return {"categories": [], "niches": []}

    # collect last score per (client_id, category_id)
    # e mapear client_id -> niche_code
    client_niches = {c.id: c.niche_code for c in clients}
    used_niches = sorted({nc for nc in client_niches.values() if nc})

    # Pra cada categoria: percorre clientes; pega ultimo score; agrega
    categories_payload = []
    for cat in cats:
        all_scores: list[int] = []
        scores_by_niche: dict[str, list[int]] = {}

        for c in clients:
            last = (
                db.query(ClientCategoryScore)
                .filter(
                    ClientCategoryScore.client_id == c.id,
                    ClientCategoryScore.category_id == cat.id,
                )
                .order_by(ClientCategoryScore.period_start.desc())
                .first()
            )
            if not last:
                continue
            all_scores.append(last.score)
            if c.niche_code:
                scores_by_niche.setdefault(c.niche_code, []).append(last.score)

        avg_overall = round(sum(all_scores) / len(all_scores)) if all_scores else None
        by_niche = {
            nc: round(sum(s) / len(s)) for nc, s in scores_by_niche.items()
        }

        categories_payload.append({
            "code": cat.code,
            "name": cat.name,
            "weight": float(cat.weight),
            "description": cat.description,
            "avg_overall": avg_overall,
            "n_clients_scored": len(all_scores),
            "by_niche": by_niche,
        })

    # build niches list with names pra UI
    niche_rows = db.query(Niche).filter(Niche.code.in_(used_niches)).all() if used_niches else []
    niches_payload = [
        {"code": n.code, "name": n.name, "n_clients": sum(1 for c in clients if c.niche_code == n.code)}
        for n in niche_rows
    ]

    return {
        "categories": categories_payload,
        "niches": niches_payload,
    }


@router.post("/cron/score", status_code=200)
def run_scoring_cron(
    period_start: str | None = None,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
):
    """Roda o scoring para todos os clientes ativos.

    Protegido por X-Cron-Secret (mesmo padrao do /api/sync/all). Chamado
    pela Vercel Cron toda segunda 06h BRT (definido em vercel.json).

    `period_start` opcional (ISO YYYY-MM-DD) — default = segunda da semana
    atual. Util pra recalcular periodos passados manualmente.
    """
    expected = settings.CRON_SECRET or os.environ.get("CRON_SECRET")
    if settings.is_production and not expected:
        raise HTTPException(500, "CRON_SECRET not configured (production requires it)")
    if expected and x_cron_secret != expected:
        raise HTTPException(401, "invalid cron secret")

    if period_start:
        ps = date.fromisoformat(period_start)
        if ps.weekday() != 0:
            # forca ser segunda-feira pra manter idempotencia da unique constraint
            ps = ps - timedelta(days=ps.weekday())
    else:
        ps = None  # delega o default pro engine (semana ISO anterior)

    results = run_for_all(db, period_start=ps)
    effective_ps = ps if ps else (iso_week_start(date.today()) - timedelta(days=7))
    return {
        "period_start": effective_ps.isoformat(),
        "scored": len(results),
        "summary": [
            {
                "slug": r.slug,
                "score": r.composite,
                "tier": r.tier,
                "delta_vs_prev": r.delta_vs_prev,
                "stale_categories": [c.code for c in r.categories if c.score is None],
            }
            for r in results
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Comparativo por nicho — clientes do mesmo nicho lado a lado
# ═══════════════════════════════════════════════════════════════════════════

def _client_metrics_window(db: Session, client_id: int, since: date, until: date) -> dict:
    """Agrega CTR, CPC, ROAS, spend, revenue de um cliente no intervalo."""
    base = (
        db.query(
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("imps"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .one()
    )
    spend = float(base.spend or 0)
    imps = int(base.imps or 0)
    clicks = int(base.clicks or 0)

    conv_rows = (
        db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
        .filter(
            MetaInsightsDaily.client_id == client_id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .all()
    )
    api_conv = _aggregate_conversions(conv_rows)
    manual = aggregate_manuals(db, client_id, since, until)
    revenue = api_conv["revenue"] + manual["revenue"]

    return {
        "spend": round(spend, 2),
        "impressions": imps,
        "clicks": clicks,
        "ctr_pct": round((clicks / imps * 100), 2) if imps else None,
        "cpc": round((spend / clicks), 2) if clicks else None,
        "revenue": round(revenue, 2),
        "roas": round((revenue / spend), 2) if spend else None,
        "messages": api_conv["messages"] + manual["messages"],
        "leads": api_conv["leads"] + manual["leads"],
        "purchases": api_conv["purchases"] + manual["purchases"],
    }


def _percentile_band(value: float | None, bench: dict | None, *, lower_is_better: bool = False) -> str | None:
    """Retorna 'pos' / 'neutral' / 'neg' conforme a posicao vs p25/p50/p75 do benchmark."""
    if value is None or bench is None:
        return None
    p25, p50, p75 = bench["p25"], bench["p50"], bench["p75"]
    if lower_is_better:
        if value <= p25:
            return "pos"
        if value >= p75:
            return "neg"
        return "neutral"
    if value <= p25:
        return "neg"
    if value >= p75:
        return "pos"
    return "neutral"


def _rank(values: list[tuple[str, float | None]], *, reverse: bool = True) -> dict[str, int]:
    """Ranqueia slugs por valor. reverse=True => maior eh melhor (1 = lider).

    None vai pro fim do ranking (sem rank).
    """
    valid = [(slug, v) for slug, v in values if v is not None]
    valid.sort(key=lambda x: x[1], reverse=reverse)
    out: dict[str, int] = {}
    for i, (slug, _) in enumerate(valid):
        out[slug] = i + 1
    return out


@router.get("/portfolio/niches/{niche_code}/comparison")
def niche_comparison(
    niche_code: str,
    days: int = 30,
    db: Session = Depends(get_db),
):
    """Comparativo lado-a-lado dos clientes do mesmo nicho.

    Janela default = ultimos 30 dias (estavel; absorve outliers diarios).
    Retorna metricas + benchmarks (industry e portfolio quando n>=3) +
    ranks por metrica (1 = lider do nicho).
    """
    niche = db.query(Niche).filter(Niche.code == niche_code).first()
    if not niche:
        raise HTTPException(404, f"niche '{niche_code}' not found")

    today = date.today()
    since = today - timedelta(days=days - 1)
    month_start = date(today.year, today.month, 1)

    clients = (
        db.query(Client)
        .filter(Client.is_active.is_(True), Client.niche_code == niche_code)
        .order_by(Client.name)
        .all()
    )

    # benchmarks industry (e portfolio quando vier)
    bench_rows = (
        db.query(NicheBenchmark)
        .filter(NicheBenchmark.niche_code == niche_code)
        .all()
    )
    benchmarks: dict[str, dict[str, dict]] = {"industry": {}, "portfolio": {}}
    for r in bench_rows:
        if r.p25 is None or r.p50 is None or r.p75 is None:
            continue
        benchmarks[r.source][r.metric] = {
            "p25": float(r.p25), "p50": float(r.p50), "p75": float(r.p75),
        }

    # primeiro: agrega metricas pra cada cliente
    rows = []
    for c in clients:
        metrics = _client_metrics_window(db, c.id, since, today)
        # MTD em paralelo (separado da janela do ranking)
        mtd_spend = float(
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
        mtd_conv = (
            db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.level == "account",
                MetaInsightsDaily.breakdown_key == "none",
                MetaInsightsDaily.date >= month_start,
                MetaInsightsDaily.date <= today,
            )
            .all()
        )
        mtd_api = _aggregate_conversions(mtd_conv)
        mtd_manual = aggregate_manuals(db, c.id, month_start, today)
        mtd_revenue = round(mtd_api["revenue"] + mtd_manual["revenue"], 2)

        rows.append({
            "client": c,
            "metrics": metrics,
            "mtd_spend": round(mtd_spend, 2),
            "mtd_revenue": mtd_revenue,
        })

    # ranking por metrica (entre os clientes do nicho)
    rank_score = _rank([(r["client"].slug, r["client"].score_current) for r in rows], reverse=True)
    rank_ctr = _rank([(r["client"].slug, r["metrics"]["ctr_pct"]) for r in rows], reverse=True)
    rank_cpc = _rank([(r["client"].slug, r["metrics"]["cpc"]) for r in rows], reverse=False)  # menor eh melhor
    rank_roas = _rank([(r["client"].slug, r["metrics"]["roas"]) for r in rows], reverse=True)

    # portfolio averages (so calcula se 2+ clientes do nicho com dados)
    def _avg(field: str) -> float | None:
        vals = [r["metrics"][field] for r in rows if r["metrics"][field] is not None]
        return round(sum(vals) / len(vals), 2) if len(vals) >= 2 else None

    portfolio_avg = {
        "ctr_pct": _avg("ctr_pct"),
        "cpc": _avg("cpc"),
        "roas": _avg("roas"),
    }

    industry = benchmarks["industry"]

    clients_payload = []
    for r in rows:
        c = r["client"]
        m = r["metrics"]
        clients_payload.append({
            "slug": c.slug,
            "name": c.name,
            "accent_color": c.accent_color,
            "tier": c.tier_current,
            "score": c.score_current,
            "score_updated_at": c.score_updated_at.isoformat() if c.score_updated_at else None,
            "monthly_budget": float(c.monthly_budget) if c.monthly_budget else None,
            "monthly_revenue_goal": float(c.monthly_revenue_goal) if c.monthly_revenue_goal else None,
            "metrics": m,
            "mtd_spend": r["mtd_spend"],
            "mtd_revenue": r["mtd_revenue"],
            "ranks": {
                "score": rank_score.get(c.slug),
                "ctr": rank_ctr.get(c.slug),
                "cpc": rank_cpc.get(c.slug),
                "roas": rank_roas.get(c.slug),
            },
            "bands": {
                "ctr": _percentile_band(m["ctr_pct"], industry.get("ctr")),
                "cpc": _percentile_band(m["cpc"], industry.get("cpc"), lower_is_better=True),
                "roas": _percentile_band(m["roas"], industry.get("roas")),
            },
        })

    return {
        "niche": {
            "code": niche.code,
            "name": niche.name,
            "n_clients": len(clients),
        },
        "window": {
            "since": since.isoformat(),
            "until": today.isoformat(),
            "days": days,
        },
        "benchmarks": benchmarks,
        "portfolio_avg": portfolio_avg,
        "clients": clients_payload,
    }
