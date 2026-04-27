"""seed niche_benchmarks — medianas Meta industry 2026

Versao inicial / placeholder. Source = 'industry'. Numeros conservadores
baseados em medianas Triple Whale + MHI Growth Engine 2026.

Distingue 2 perfis:
- ecommerce-like (CTR + CPC + ROAS): artesanato-textil, cortinas-persianas,
  ecommerce-fashion, ecommerce-decor, ecommerce-food, infoproduto, outro
- lead-gen-like (so CTR + CPC, ROAS nao se aplica direto): incorporadora,
  corretagem, imobiliaria, saude-estetica, educacao, b2b, servicos-locais

Quando o portfolio NUX tiver >=3 clientes/nicho, Fase 4 do plano substitui
'industry' por 'portfolio' (calculado dos proprios dados).

Idempotente — ON CONFLICT DO NOTHING.

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


# (p25, p50, p75) por metrica
ECOMMERCE_BENCH = {
    "ctr":  (1.00, 1.80, 3.00),    # Click-Through Rate em %
    "cpc":  (1.50, 3.00, 6.00),    # Custo por Click em R$ (lower_is_better)
    "roas": (1.50, 3.00, 5.00),    # Return on Ad Spend (x)
}

LEADGEN_BENCH = {
    "ctr":  (0.50, 1.00, 2.00),
    "cpc":  (3.00, 6.00, 12.00),
}

ECOMMERCE_NICHES = [
    "artesanato-textil",
    "cortinas-persianas",
    "ecommerce-fashion",
    "ecommerce-decor",
    "ecommerce-food",
    "infoproduto",
    "outro",
]

LEADGEN_NICHES = [
    "incorporadora",
    "corretagem",
    "imobiliaria",
    "saude-estetica",
    "educacao",
    "b2b",
    "servicos-locais",
]


def _insert(niche_code: str, metric: str, p25: float, p50: float, p75: float) -> None:
    op.execute(
        sa.text(
            "INSERT INTO niche_benchmarks (niche_code, metric, p25, p50, p75, source) "
            "VALUES (:nc, :m, :p25, :p50, :p75, 'industry') "
            "ON CONFLICT ON CONSTRAINT uq_niche_metric_source DO NOTHING"
        ).bindparams(nc=niche_code, m=metric, p25=p25, p50=p50, p75=p75)
    )


def upgrade() -> None:
    for niche in ECOMMERCE_NICHES:
        for metric, (p25, p50, p75) in ECOMMERCE_BENCH.items():
            _insert(niche, metric, p25, p50, p75)

    for niche in LEADGEN_NICHES:
        for metric, (p25, p50, p75) in LEADGEN_BENCH.items():
            _insert(niche, metric, p25, p50, p75)


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM niche_benchmarks WHERE source = 'industry'"))
