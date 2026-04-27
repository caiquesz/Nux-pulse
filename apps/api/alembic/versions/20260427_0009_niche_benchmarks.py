"""niche_benchmarks — medianas Meta por nicho × metrica

Tabela de referencia que o engine de scoring usa pra normalizar metricas
do cliente vs benchmark do nicho (PLANO_COMMAND_CENTER.md §3.3, §4.1).

`source` distingue 'industry' (medianas publicas Triple Whale / MHI 2026)
de 'portfolio' (benchmark do proprio portfolio NUX, calculado quando
n_clientes_por_nicho >= 3 — ver Fase 4 do plano).

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "niche_benchmarks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("niche_code", sa.String(40), sa.ForeignKey("niches.code", ondelete="CASCADE"), nullable=False),
        sa.Column("metric", sa.String(40), nullable=False),  # ctr | cpc | roas | cvr | cpm | freq
        sa.Column("p25", sa.Numeric(12, 4), nullable=True),
        sa.Column("p50", sa.Numeric(12, 4), nullable=True),
        sa.Column("p75", sa.Numeric(12, 4), nullable=True),
        sa.Column("source", sa.String(40), nullable=False),  # 'industry' | 'portfolio'
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("niche_code", "metric", "source", name="uq_niche_metric_source"),
    )
    op.create_index("ix_niche_benchmarks_lookup", "niche_benchmarks", ["niche_code", "metric"])


def downgrade() -> None:
    op.drop_index("ix_niche_benchmarks_lookup", table_name="niche_benchmarks")
    op.drop_table("niche_benchmarks")
