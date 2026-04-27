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


@router.get("/portfolio/overview")
def portfolio_overview(db: Session = Depends(get_db)):
    """Agregacao para a home do Command Center.

    Retorna:
    - kpis: portfolio-level (clientes ativos, spend MTD, receita MTD, ROAS,
      % S/A, # alertas critical, delta score medio 7d)
    - tier_breakdown: { S, A, B, C, D, none } -> count
    - clients: lista [{slug, name, niche_code, accent_color, tier, score,
      delta_vs_prev, monthly_budget, monthly_revenue_goal, mtd_spend,
      mtd_revenue, alerts: {neg, warn, info}}]
    """
    today = date.today()
    month_start = date(today.year, today.month, 1)

    clients = db.query(Client).filter(Client.is_active.is_(True)).order_by(Client.name).all()

    tier_breakdown = {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0, "none": 0}
    deltas: list[int] = []

    portfolio_spend = 0.0
    portfolio_revenue = 0.0
    clients_payload = []

    for c in clients:
        tier_breakdown[c.tier_current or "none"] = tier_breakdown.get(c.tier_current or "none", 0) + 1

        # MTD spend + revenue
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
        conv_rows = (
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
        api_conv = _aggregate_conversions(conv_rows)
        manual = aggregate_manuals(db, c.id, month_start, today)
        mtd_revenue = round(api_conv["revenue"] + manual["revenue"], 2)

        portfolio_spend += mtd_spend
        portfolio_revenue += mtd_revenue

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

        # ultima sincronizacao Meta
        last_sync = (
            db.query(func.max(MetaInsightsDaily.date))
            .filter(MetaInsightsDaily.client_id == c.id)
            .scalar()
        )

        # delta da ultima semana (denormalizado em clients seria ideal — TODO)
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
            "mtd_spend": round(mtd_spend, 2),
            "mtd_revenue": mtd_revenue,
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

    return {
        "as_of": today.isoformat(),
        "month_start": month_start.isoformat(),
        "kpis": {
            "active_clients": len(clients),
            "portfolio_spend_mtd": round(portfolio_spend, 2),
            "portfolio_revenue_mtd": round(portfolio_revenue, 2),
            "portfolio_roas_mtd": portfolio_roas,
            "pct_sa": pct_sa,
            "critical_alerts": crit_alerts,
            "avg_delta_7d": avg_delta,
        },
        "tier_breakdown": tier_breakdown,
        "clients": clients_payload,
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
