"""Orquestrador do scoring — itera clientes ativos, agrega categorias, persiste.

Usa upsert (ON CONFLICT) pra ser idempotente: rodar duas vezes na mesma
period_start nao duplica linhas, atualiza com o ultimo calculo.

Renormalizacao de pesos: quando uma categoria retorna score=None (stale),
o peso dela e excluido da soma e os pesos restantes sao normalizados pra
preservar a escala 0-100 do composto. Detalhes em PLANO_COMMAND_CENTER.md
§4.2 + decisoes da §9.

Periodicidade decidida na §9: semanal, segunda 06h BRT.
period_start = segunda da ISO week.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.scoring import ClientCategoryScore, ClientScore, ServiceCategory

from app.services.scoring.categories import CATEGORY_FUNCTIONS
from app.services.scoring.tiers import score_to_tier


@dataclass
class CategoryResult:
    code: str
    weight: float
    score: int | None
    components: dict


@dataclass
class ClientResult:
    client_id: int
    slug: str
    composite: int | None
    tier: str | None
    delta_vs_prev: int | None
    categories: list[CategoryResult]


def iso_week_start(d: date) -> date:
    """Segunda da semana ISO de `d`."""
    return d - timedelta(days=d.weekday())


def score_client(
    db: Session, client: Client, period_start: date, period_end: date
) -> ClientResult:
    cats = db.query(ServiceCategory).order_by(ServiceCategory.id).all()
    results: list[CategoryResult] = []
    for cat in cats:
        fn = CATEGORY_FUNCTIONS.get(cat.code)
        if not fn:
            continue
        try:
            score, components = fn(db, client, period_start, period_end)
        except Exception as exc:  # noqa: BLE001 — falha em uma categoria nao deve travar o cliente
            score, components = None, {"error": str(exc)}
        results.append(CategoryResult(cat.code, float(cat.weight), score, components))

    # composto com renormalizacao
    have = [r for r in results if r.score is not None]
    if not have:
        composite = None
    else:
        total_w = sum(r.weight for r in have)
        composite = int(round(sum(r.score * r.weight for r in have) / total_w))

    # delta vs ultimo period anterior
    prev = (
        db.query(ClientScore)
        .filter(ClientScore.client_id == client.id, ClientScore.period_start < period_start)
        .order_by(ClientScore.period_start.desc())
        .first()
    )
    delta = (composite - prev.score) if (composite is not None and prev and prev.score is not None) else None

    return ClientResult(
        client_id=client.id,
        slug=client.slug,
        composite=composite,
        tier=score_to_tier(composite),
        delta_vs_prev=delta,
        categories=results,
    )


def persist(db: Session, result: ClientResult, period_start: date) -> None:
    cats = {c.code: c for c in db.query(ServiceCategory).all()}

    # client_category_scores (upsert)
    for r in result.categories:
        if r.score is None:
            continue
        cat = cats.get(r.code)
        if not cat:
            continue
        stmt = pg_insert(ClientCategoryScore).values(
            client_id=result.client_id,
            category_id=cat.id,
            period_start=period_start,
            score=r.score,
            components=r.components,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_client_cat_period",
            set_={"score": stmt.excluded.score, "components": stmt.excluded.components, "computed_at": datetime.now(timezone.utc)},
        )
        db.execute(stmt)

    # client_scores (upsert)
    stmt = pg_insert(ClientScore).values(
        client_id=result.client_id,
        period_start=period_start,
        score=result.composite,
        tier=result.tier,
        delta_vs_prev=result.delta_vs_prev,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_client_period",
        set_={
            "score": stmt.excluded.score,
            "tier": stmt.excluded.tier,
            "delta_vs_prev": stmt.excluded.delta_vs_prev,
            "computed_at": datetime.now(timezone.utc),
        },
    )
    db.execute(stmt)

    # denorm em clients (current snapshot)
    db.query(Client).filter(Client.id == result.client_id).update({
        "score_current": result.composite,
        "tier_current": result.tier,
        "score_updated_at": datetime.now(timezone.utc),
    })

    db.commit()


def run_for_all(db: Session, period_start: date | None = None) -> list[ClientResult]:
    """Calcula e persiste score pra todos os clientes ativos.

    `period_start` default = segunda da semana ISO **anterior** (semana
    fechada). period_end = domingo da mesma semana (period_start + 6).

    Razao: o cron roda segunda 06h BRT — usar a semana atual significa
    1 dia de dado (zero ate as 06h). A semana anterior e a janela natural
    'fechada' pra reportar.

    Pra recalcular periodo passado, passa `period_start` explicitamente
    (ex: '2026-04-13' calcula a semana de 13-19 abril).
    """
    if period_start is None:
        period_start = iso_week_start(date.today()) - timedelta(days=7)
    period_end = period_start + timedelta(days=6)

    clients = db.query(Client).filter(Client.is_active.is_(True)).all()
    results: list[ClientResult] = []
    for c in clients:
        r = score_client(db, c, period_start, period_end)
        persist(db, r, period_start)
        results.append(r)
    return results
