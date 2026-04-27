"""scoring engine — service_categories + client_category_scores + client_scores

Tabelas que sustentam o engine de scoring do Command Center
(PLANO_COMMAND_CENTER.md §3.2):

- service_categories: 7 categorias (peso editável sem deploy)
- client_category_scores: histórico por cliente × categoria × período
- client_scores: histórico do score composto + tier por cliente × período

Frequência: semanal (segunda 06h BRT). period_start = segunda da ISO week.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(40), unique=True, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("weight", sa.Numeric(4, 3), nullable=False),  # 0.000–1.000
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "client_category_scores",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("service_categories.id"), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("score", sa.SmallInteger, nullable=False),
        sa.Column("components", postgresql.JSONB, nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("client_id", "category_id", "period_start", name="uq_client_cat_period"),
    )
    op.create_index("ix_client_cat_scores_client", "client_category_scores", ["client_id"])
    op.create_index("ix_client_cat_scores_period", "client_category_scores", ["period_start"])

    op.create_table(
        "client_scores",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("score", sa.SmallInteger, nullable=True),
        sa.Column("tier", sa.String(1), nullable=True),
        sa.Column("delta_vs_prev", sa.SmallInteger, nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("client_id", "period_start", name="uq_client_period"),
    )
    op.create_index("ix_client_scores_client", "client_scores", ["client_id"])
    op.create_index("ix_client_scores_period", "client_scores", ["period_start"])


def downgrade() -> None:
    op.drop_index("ix_client_scores_period", table_name="client_scores")
    op.drop_index("ix_client_scores_client", table_name="client_scores")
    op.drop_table("client_scores")

    op.drop_index("ix_client_cat_scores_period", table_name="client_category_scores")
    op.drop_index("ix_client_cat_scores_client", table_name="client_category_scores")
    op.drop_table("client_category_scores")

    op.drop_table("service_categories")
