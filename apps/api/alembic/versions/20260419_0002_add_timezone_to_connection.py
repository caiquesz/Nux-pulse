"""add timezone_name to account_connections

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("account_connections", sa.Column("timezone_name", sa.String(64)))
    op.add_column("account_connections", sa.Column("currency", sa.String(8)))


def downgrade() -> None:
    op.drop_column("account_connections", "currency")
    op.drop_column("account_connections", "timezone_name")
