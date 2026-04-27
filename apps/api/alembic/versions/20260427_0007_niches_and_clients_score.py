"""niches table + scoring fields em clients

Cria a tabela `niches` (self-service: Caique adiciona via UI) e adiciona
em `clients` os campos de scoring/portfolio: niche_code (FK), segment,
onboarded_at, tier_current, score_current, score_updated_at.

Parte da Fase 1 do Command Center (PLANO_COMMAND_CENTER.md §3.1).

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "niches",
        sa.Column("code", sa.String(40), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column("clients", sa.Column("niche_code", sa.String(40), nullable=True))
    op.add_column("clients", sa.Column("segment", sa.String(40), nullable=True))
    op.add_column("clients", sa.Column("onboarded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("clients", sa.Column("tier_current", sa.String(1), nullable=True))
    op.add_column("clients", sa.Column("score_current", sa.SmallInteger, nullable=True))
    op.add_column("clients", sa.Column("score_updated_at", sa.DateTime(timezone=True), nullable=True))

    op.create_foreign_key(
        "fk_clients_niche_code",
        "clients", "niches",
        ["niche_code"], ["code"],
        ondelete="SET NULL",
    )
    op.create_index("ix_clients_niche_code", "clients", ["niche_code"])
    op.create_index("ix_clients_tier", "clients", ["tier_current"])


def downgrade() -> None:
    op.drop_index("ix_clients_tier", table_name="clients")
    op.drop_index("ix_clients_niche_code", table_name="clients")
    op.drop_constraint("fk_clients_niche_code", "clients", type_="foreignkey")
    op.drop_column("clients", "score_updated_at")
    op.drop_column("clients", "score_current")
    op.drop_column("clients", "tier_current")
    op.drop_column("clients", "onboarded_at")
    op.drop_column("clients", "segment")
    op.drop_column("clients", "niche_code")
    op.drop_table("niches")
