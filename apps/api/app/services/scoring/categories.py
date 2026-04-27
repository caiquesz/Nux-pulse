"""Funcoes de scoring por categoria — uma por code de service_categories.

Cada funcao:
- retorna (score: int | None, components: dict)
- score `None` = categoria 'stale' (sem dados pra calcular)
- engine.py renormaliza pesos quando uma categoria e stale
- components e o JSONB que vai pra client_category_scores.components — debug/explicabilidade.

Formulas detalhadas em PLANO_COMMAND_CENTER.md §4.1.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.connection import AccountConnection
from app.models.meta import MetaCampaign, MetaCreative, MetaInsightsDaily
from app.models.project import Task
from app.routers.conversions import aggregate_manuals
from app.routers.insights import _aggregate_conversions

from app.services.scoring.benchmarks import get_benchmark, percentile_score


def _clip(value: float, lo: float = 0, hi: float = 100) -> int:
    return int(round(max(lo, min(hi, value))))


# ═══════════════════════════════════════════════════════════════════════════
#  1. media_performance — peso 0.30
# ═══════════════════════════════════════════════════════════════════════════

def media_performance(db: Session, client: Client, period_start: date, period_end: date):
    base = (
        db.query(
            func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
            func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
        )
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= period_start,
            MetaInsightsDaily.date <= period_end,
        )
        .one()
    )
    spend = float(base.spend or 0)
    imps = int(base.impressions or 0)
    clicks = int(base.clicks or 0)

    conv_rows = (
        db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= period_start,
            MetaInsightsDaily.date <= period_end,
        )
        .all()
    )
    api_conv = _aggregate_conversions(conv_rows)
    manual = aggregate_manuals(db, client.id, period_start, period_end)
    revenue = api_conv["revenue"] + manual["revenue"]

    if spend == 0 or imps == 0:
        return None, {"reason": "no_spend_or_impressions"}

    ctr = (clicks / imps) * 100 if imps else 0
    cpc = (spend / clicks) if clicks else None
    roas = (revenue / spend) if spend else 0

    bench_ctr = get_benchmark(db, client.niche_code, "ctr")
    bench_cpc = get_benchmark(db, client.niche_code, "cpc")
    bench_roas = get_benchmark(db, client.niche_code, "roas")

    s_ctr = percentile_score(ctr, bench_ctr)
    s_cpc = percentile_score(cpc, bench_cpc, lower_is_better=True)
    s_roas = percentile_score(roas, bench_roas)

    # se nenhum benchmark existe, categoria fica stale
    sub = [(s_ctr, 0.35), (s_cpc, 0.20), (s_roas, 0.45)]
    have = [(s, w) for s, w in sub if s is not None]
    if not have:
        return None, {
            "reason": "no_benchmark",
            "ctr": ctr, "cpc": cpc, "roas": roas,
        }

    total_w = sum(w for _, w in have)
    score = sum(s * w for s, w in have) / total_w
    return _clip(score), {
        "ctr": round(ctr, 2),
        "cpc": round(cpc, 2) if cpc else None,
        "roas": round(roas, 2),
        "ctr_score": s_ctr,
        "cpc_score": s_cpc,
        "roas_score": s_roas,
        "benchmarks_present": [m for m, b in zip(("ctr", "cpc", "roas"), (bench_ctr, bench_cpc, bench_roas)) if b],
    }


# ═══════════════════════════════════════════════════════════════════════════
#  2. strategy_pacing — peso 0.20
# ═══════════════════════════════════════════════════════════════════════════

def strategy_pacing(db: Session, client: Client, period_start: date, period_end: date):
    if not client.monthly_budget or not client.monthly_revenue_goal:
        return None, {"reason": "missing_budget_or_goal"}

    # janela 30d pra goal_pct (independente do period_start ISO)
    until = period_end
    since = until - timedelta(days=29)
    conv_rows = (
        db.query(MetaInsightsDaily.actions, MetaInsightsDaily.action_values)
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= since,
            MetaInsightsDaily.date <= until,
        )
        .all()
    )
    api_conv = _aggregate_conversions(conv_rows)
    manual = aggregate_manuals(db, client.id, since, until)
    revenue_30d = api_conv["revenue"] + manual["revenue"]
    goal_pct = min(revenue_30d / float(client.monthly_revenue_goal), 1.2)

    # budget_pacing: gasto MTD / gasto ideal MTD
    today = date.today()
    days_in_month = (date(today.year + (today.month // 12), (today.month % 12) + 1, 1) - timedelta(days=1)).day
    mtd_spend = float(
        db.query(func.coalesce(func.sum(MetaInsightsDaily.spend), 0))
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= date(today.year, today.month, 1),
            MetaInsightsDaily.date <= today,
        )
        .scalar() or 0
    )
    ideal_mtd = float(client.monthly_budget) * (today.day / days_in_month)
    if ideal_mtd > 0:
        deviation = abs(mtd_spend - ideal_mtd) / ideal_mtd
        budget_pacing = max(0.0, 1.0 - deviation)
    else:
        budget_pacing = 1.0

    score = 60 * goal_pct / 1.2 + 40 * budget_pacing  # normaliza goal_pct (cap 1.2 -> 1.0)
    return _clip(score), {
        "revenue_30d": round(revenue_30d, 2),
        "monthly_revenue_goal": float(client.monthly_revenue_goal),
        "goal_pct": round(goal_pct, 3),
        "mtd_spend": round(mtd_spend, 2),
        "ideal_mtd": round(ideal_mtd, 2),
        "budget_pacing": round(budget_pacing, 3),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  3. account_health — peso 0.15
# ═══════════════════════════════════════════════════════════════════════════

def account_health(db: Session, client: Client, period_start: date, period_end: date):
    """Versao MVP: connections + sync + frequency.

    TODO Fase 1.1: pixel/CAPI sem evento purchase 7d (-20), >50% campanhas
    pausadas ha >30d (-15). Enquanto nao implementado, score parte de 100
    so com penalizacoes de connections + freshness.
    """
    score = 100.0
    components: dict = {"deductions": []}

    conns = (
        db.query(AccountConnection)
        .filter(AccountConnection.client_id == client.id)
        .all()
    )
    if not conns:
        return None, {"reason": "no_connections"}

    for c in conns:
        if c.last_error:
            score -= 40
            components["deductions"].append({"reason": "connection_error", "penalty": -40, "platform": c.platform.value if hasattr(c.platform, "value") else str(c.platform)})

    # ultimo sync >48h (qualquer conexao)
    now = datetime.now(timezone.utc)
    stale_syncs = [c for c in conns if c.last_sync_at and (now - c.last_sync_at).total_seconds() > 48 * 3600]
    no_sync_yet = [c for c in conns if c.last_sync_at is None]
    if stale_syncs or no_sync_yet:
        score -= 30
        components["deductions"].append({"reason": "sync_gap_48h", "penalty": -30, "stale": len(stale_syncs), "never": len(no_sync_yet)})

    # frequency media nas top 3 campanhas (janela period)
    top3 = (
        db.query(func.avg(MetaInsightsDaily.frequency).label("freq"))
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "campaign",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= period_start,
            MetaInsightsDaily.date <= period_end,
        )
        .scalar()
    )
    avg_freq = float(top3) if top3 is not None else 0
    if avg_freq >= 5:
        score -= 20
        components["deductions"].append({"reason": "high_frequency", "penalty": -20, "avg_freq": avg_freq})
    elif avg_freq >= 3:
        score -= 10
        components["deductions"].append({"reason": "elevated_frequency", "penalty": -10, "avg_freq": avg_freq})

    components["avg_frequency"] = round(avg_freq, 2)
    components["connections"] = len(conns)
    return _clip(score), components


# ═══════════════════════════════════════════════════════════════════════════
#  4. creative_freshness — peso 0.10
# ═══════════════════════════════════════════════════════════════════════════

def creative_freshness(db: Session, client: Client, period_start: date, period_end: date):
    """Versao MVP: volume novo no mes + idade media top-5 + freq top-3."""
    today = date.today()
    month_start = date(today.year, today.month, 1)

    new_this_month = (
        db.query(func.count(MetaCreative.id))
        .filter(
            MetaCreative.client_id == client.id,
            MetaCreative.created_at >= month_start,
        )
        .scalar() or 0
    )

    # idade media top-5 (criatividos com mais spend no periodo, via meta_ads -> creative_id)
    top5_ages = []
    rows = (
        db.query(MetaCreative.created_at)
        .filter(MetaCreative.client_id == client.id)
        .order_by(MetaCreative.created_at.desc())
        .limit(5)
        .all()
    )
    now = datetime.now(timezone.utc)
    for (ca,) in rows:
        if ca:
            age_days = (now - ca).total_seconds() / 86400
            top5_ages.append(age_days)
    avg_age = sum(top5_ages) / len(top5_ages) if top5_ages else None

    score = 0.0
    components: dict = {}

    if new_this_month >= 8:
        score += 50; components["volume_bonus"] = 50
    elif new_this_month >= 4:
        score += 25; components["volume_bonus"] = 25
    else:
        components["volume_bonus"] = 0

    if avg_age is not None:
        if avg_age < 21:
            score += 30; components["age_bonus"] = 30
        elif avg_age < 45:
            score += 15; components["age_bonus"] = 15
        else:
            components["age_bonus"] = 0
    else:
        components["age_bonus"] = 0

    # frequency top-3 do periodo
    top3_freq = (
        db.query(func.avg(MetaInsightsDaily.frequency))
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "campaign",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= period_start,
            MetaInsightsDaily.date <= period_end,
        )
        .scalar()
    )
    avg_freq = float(top3_freq) if top3_freq is not None else 0
    if avg_freq < 3 and avg_freq > 0:
        score += 20; components["freq_bonus"] = 20
    elif avg_freq < 5 and avg_freq > 0:
        score += 10; components["freq_bonus"] = 10
    else:
        components["freq_bonus"] = 0

    if new_this_month == 0 and avg_age is None:
        return None, {"reason": "no_creatives_data"}

    components.update({
        "new_creatives_this_month": new_this_month,
        "avg_age_days_top5": round(avg_age, 1) if avg_age else None,
        "avg_freq": round(avg_freq, 2),
    })
    return _clip(score), components


# ═══════════════════════════════════════════════════════════════════════════
#  5. operations_sla — peso 0.10
# ═══════════════════════════════════════════════════════════════════════════

def operations_sla(db: Session, client: Client, period_start: date, period_end: date):
    until = datetime.now(timezone.utc)
    since = until - timedelta(days=30)

    tasks_30d = (
        db.query(Task)
        .filter(
            Task.client_id == client.id,
            Task.created_at >= since,
        )
        .all()
    )
    if not tasks_30d:
        return None, {"reason": "no_tasks_in_window"}

    completed_on_time = sum(
        1 for t in tasks_30d
        if t.status == "done" and t.due_at and t.completed_at and t.completed_at <= t.due_at
    )
    completed = sum(1 for t in tasks_30d if t.status == "done")
    overdue_open = sum(
        1 for t in tasks_30d
        if t.status != "done" and t.due_at and t.due_at < until and (until - t.due_at).days > 14
    )
    urgentes_pending = sum(1 for t in tasks_30d if t.priority == "urgente" and t.status != "done")

    on_time_pct = (completed_on_time / completed) if completed else 0
    score = 70 * on_time_pct
    score -= min(20, overdue_open * 4)
    score -= min(15, urgentes_pending * 5)

    return _clip(score, lo=0, hi=70 if not on_time_pct else 100), {
        "tasks_30d": len(tasks_30d),
        "completed": completed,
        "completed_on_time": completed_on_time,
        "on_time_pct": round(on_time_pct, 2),
        "overdue_open_14d": overdue_open,
        "urgentes_pending": urgentes_pending,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  6. relationship — peso 0.10 (manual; sem dados ainda)
# ═══════════════════════════════════════════════════════════════════════════

def relationship(db: Session, client: Client, period_start: date, period_end: date):
    """Sem tabela de notas ainda — retorna stale.

    Quando vier a tabela `relationship_notes` (Fase 2 do Command Center),
    esta funcao le a ultima nota dentro de 14d e retorna o score.
    """
    return None, {"reason": "no_notes_table_yet"}


# ═══════════════════════════════════════════════════════════════════════════
#  7. tracking_quality — peso 0.05
# ═══════════════════════════════════════════════════════════════════════════

# Eventos canonicos pro Pulse — alinhados com PURCHASE_TYPES_RANKED do insights.py
TRACKED_EVENTS = ("purchase", "lead", "add_to_cart", "initiate_checkout", "view_content")


def tracking_quality(db: Session, client: Client, period_start: date, period_end: date):
    """Versao MVP: cobertura de eventos via JSONB actions.

    TODO: EMQ Meta API + divergencia GA x Meta (placeholder ate GA conectado).
    """
    rows = (
        db.query(MetaInsightsDaily.actions)
        .filter(
            MetaInsightsDaily.client_id == client.id,
            MetaInsightsDaily.level == "account",
            MetaInsightsDaily.breakdown_key == "none",
            MetaInsightsDaily.date >= period_start,
            MetaInsightsDaily.date <= period_end,
        )
        .all()
    )
    if not rows:
        return None, {"reason": "no_insights"}

    seen: set[str] = set()
    for (acts,) in rows:
        if acts:
            for k in acts.keys():
                # action_type pode ter sufixos tipo offsite_conversion.fb_pixel_purchase
                low = k.lower()
                for ev in TRACKED_EVENTS:
                    if ev in low:
                        seen.add(ev)

    coverage = len(seen) / len(TRACKED_EVENTS)
    score = coverage * 40  # ate 40 pts pela cobertura
    # +20 placeholder ate GA conectado (assume ok)
    score += 20
    # +40 EMQ Meta — sem API ainda; assume 5 (medio) -> +20
    score += 20

    return _clip(score), {
        "events_seen": sorted(seen),
        "events_total": len(TRACKED_EVENTS),
        "coverage_pct": round(coverage, 2),
        "emq_placeholder": True,
        "ga_placeholder": True,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Registry — engine.py usa esse mapa
# ═══════════════════════════════════════════════════════════════════════════

CategoryFn = Callable[[Session, Client, date, date], tuple[int | None, dict]]

CATEGORY_FUNCTIONS: dict[str, CategoryFn] = {
    "media_performance": media_performance,
    "strategy_pacing": strategy_pacing,
    "account_health": account_health,
    "creative_freshness": creative_freshness,
    "operations_sla": operations_sla,
    "relationship": relationship,
    "tracking_quality": tracking_quality,
}
