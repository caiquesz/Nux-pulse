"""manual_conversions

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "manual_conversions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("revenue", sa.Numeric(12, 2)),
        sa.Column("campaign_id", sa.String(64)),
        sa.Column("campaign_name", sa.String(200)),
        sa.Column("notes", sa.Text),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("team_members.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_manual_conv_client_id", "manual_conversions", ["client_id"])
    op.create_index("ix_manual_conv_date", "manual_conversions", ["date"])


def downgrade() -> None:
    op.drop_table("manual_conversions")
