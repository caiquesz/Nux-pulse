"""seed service_categories — 7 categorias com pesos da §9 do plano

Idempotente via INSERT ... ON CONFLICT DO NOTHING. Pesos sao decisao
fechada da §9 (PLANO_COMMAND_CENTER.md): 30/20/15/10/10/10/5.

Editar peso depois e via UPDATE direto (admin UI vem na Fase 4 do plano).

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


CATEGORIES = [
    ("media_performance", "Performance de Mídia", 0.300,
     "CTR, CPC, ROAS vs benchmark do nicho. Soma ponderada (35/20/45)."),
    ("strategy_pacing", "Estratégia & Pacing", 0.200,
     "Receita 30d / meta mensal + adesão do gasto diário ao ritmo ideal do mês."),
    ("account_health", "Saúde de Conta", 0.150,
     "Conexões com erro, gaps de sync, frequência alta nas top campanhas, eventos do pixel."),
    ("creative_freshness", "Criativos", 0.100,
     "Volume de criativos novos no mês, idade média dos top 5, frequência das top 3."),
    ("operations_sla", "Operação & SLA", 0.100,
     "% tasks completadas no prazo (30d), tasks abertas há > 14d, urgentes pendentes."),
    ("relationship", "Atendimento", 0.100,
     "Nota 0-100 semanal preenchida pelo gestor + frase opcional de contexto."),
    ("tracking_quality", "Tracking & Mensuração", 0.050,
     "EMQ Meta, cobertura de eventos (purchase/lead/atc/ic/vc), divergência GA × Meta."),
]


def upgrade() -> None:
    sc = sa.table(
        "service_categories",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("weight", sa.Numeric),
        sa.column("description", sa.Text),
    )
    for code, name, weight, description in CATEGORIES:
        op.execute(
            sa.text(
                "INSERT INTO service_categories (code, name, weight, description) "
                "VALUES (:code, :name, :weight, :description) "
                "ON CONFLICT (code) DO NOTHING"
            ).bindparams(code=code, name=name, weight=weight, description=description)
        )


def downgrade() -> None:
    codes = [c[0] for c in CATEGORIES]
    op.execute(
        sa.text("DELETE FROM service_categories WHERE code IN :codes")
        .bindparams(sa.bindparam("codes", value=tuple(codes), expanding=True))
    )
