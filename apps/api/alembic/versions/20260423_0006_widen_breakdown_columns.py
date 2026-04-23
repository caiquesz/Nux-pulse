"""widen breakdown_key/value em meta_insights_daily

Motivo: a breakdown `hourly_stats_aggregated_by_advertiser_time_zone` tem 46 chars
e não cabia em VARCHAR(32). Também amplia breakdown_value de 64→128 por segurança.

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "meta_insights_daily", "breakdown_key",
        type_=sa.String(64), existing_type=sa.String(32),
    )
    op.alter_column(
        "meta_insights_daily", "breakdown_value",
        type_=sa.String(128), existing_type=sa.String(64),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "meta_insights_daily", "breakdown_value",
        type_=sa.String(64), existing_type=sa.String(128),
        existing_nullable=True,
    )
    op.alter_column(
        "meta_insights_daily", "breakdown_key",
        type_=sa.String(32), existing_type=sa.String(64),
    )
