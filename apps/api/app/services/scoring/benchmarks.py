"""Leitura de niche_benchmarks com fallback industry -> portfolio.

Quando o nicho do cliente nao tem benchmark, retorna None — engine trata
a categoria como 'stale' e renormaliza os pesos das outras categorias.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.scoring import NicheBenchmark


def get_benchmark(
    db: Session, niche_code: str | None, metric: str
) -> tuple[float, float, float] | None:
    """Retorna (p25, p50, p75) pro nicho/metrica. None se nao existe.

    Prefere `source='portfolio'` quando disponivel (Fase 4 do plano —
    benchmark proprio NUX), com fallback pra `source='industry'`.
    """
    if not niche_code:
        return None

    # tenta portfolio primeiro
    for source in ("portfolio", "industry"):
        row = (
            db.query(NicheBenchmark)
            .filter(
                NicheBenchmark.niche_code == niche_code,
                NicheBenchmark.metric == metric,
                NicheBenchmark.source == source,
            )
            .first()
        )
        if row and row.p25 is not None and row.p50 is not None and row.p75 is not None:
            return float(row.p25), float(row.p50), float(row.p75)

    return None


def percentile_score(
    value: float | None,
    bench: tuple[float, float, float] | None,
    *,
    lower_is_better: bool = False,
) -> int | None:
    """Mapeia o valor pro score 0-100 baseado no IQR do nicho.

    None se valor ou benchmark estao ausentes — caller trata como 'stale'.
    Formula linear entre p25 e p75 (clipa nas extremidades).
    """
    if value is None or bench is None:
        return None
    p25, p50, p75 = bench

    if lower_is_better:
        if value <= p25:
            return 100
        if value >= p75:
            return 0
        # interpolacao linear: p25 -> 100, p75 -> 0
        return int(round(100 * (p75 - value) / (p75 - p25)))

    if value <= p25:
        return 0
    if value >= p75:
        return 100
    return int(round(100 * (value - p25) / (p75 - p25)))
