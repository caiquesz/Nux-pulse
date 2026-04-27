"""alerts portfolio-wide — torna client_id nullable + novos campos

Estende a tabela `alerts` pra suportar regras portfolio-wide alem dos
alertas por cliente que ja existiam (PLANO_COMMAND_CENTER.md §3.4, §6).

- client_id NOT NULL -> NULL: permite alertas que vivem no portfolio (sem
  cliente especifico) ou alertas cross-cliente.
- rule_code: identifica a regra que disparou (ex: 'tier_downgrade',
  'no_data_48h', 'connection_broken').
- category_code: relaciona logicamente a service_categories.code.
- scope: 'client' (default) ou 'portfolio'.
- acknowledged_at: usuario reconheceu o alerta (UI "Ignorar").
- task_id: vincula a uma task do Planejamento (loop alerta -> acao).

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("alerts", "client_id", existing_type=sa.Integer(), nullable=True)

    op.add_column("alerts", sa.Column("rule_code", sa.String(40), nullable=True))
    op.add_column("alerts", sa.Column("category_code", sa.String(40), nullable=True))
    op.add_column("alerts", sa.Column("scope", sa.String(20), server_default="client", nullable=False))
    op.add_column("alerts", sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("alerts", sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True))

    op.create_index("ix_alerts_rule_code", "alerts", ["rule_code"])
    op.create_index("ix_alerts_scope", "alerts", ["scope"])


def downgrade() -> None:
    op.drop_index("ix_alerts_scope", table_name="alerts")
    op.drop_index("ix_alerts_rule_code", table_name="alerts")

    op.drop_column("alerts", "task_id")
    op.drop_column("alerts", "acknowledged_at")
    op.drop_column("alerts", "scope")
    op.drop_column("alerts", "category_code")
    op.drop_column("alerts", "rule_code")

    # ⚠ Pode falhar se houver linhas com client_id NULL — limpar antes de aplicar
    # downgrade. Aceita como custo de rollback raro.
    op.alter_column("alerts", "client_id", existing_type=sa.Integer(), nullable=False)
