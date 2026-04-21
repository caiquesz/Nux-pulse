"""project module: team_members, tasks, client_files, notifications

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(160), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("role", sa.String(60)),
        sa.Column("avatar_color", sa.String(16)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_team_members_email", "team_members", ["email"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("duration_min", sa.Integer),
        sa.Column("status", sa.String(20), nullable=False, server_default="briefing"),
        sa.Column("priority", sa.String(10), nullable=False, server_default="media"),
        sa.Column("scope", sa.String(10), nullable=False, server_default="cliente"),
        sa.Column("assignee_id", sa.Integer, sa.ForeignKey("team_members.id", ondelete="SET NULL")),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("team_members.id", ondelete="SET NULL")),
        sa.Column("ai_scheduled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("ai_context", sa.Text),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_tasks_client_id", "tasks", ["client_id"])
    op.create_index("ix_tasks_due_at", "tasks", ["due_at"])
    op.create_index("ix_tasks_status", "tasks", ["status"])

    op.create_table(
        "client_files",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("storage_path", sa.String(512)),
        sa.Column("external_url", sa.String(1024)),
        sa.Column("category", sa.String(20), nullable=False, server_default="outros"),
        sa.Column("mime_type", sa.String(80)),
        sa.Column("size_bytes", sa.Integer),
        sa.Column("description", sa.Text),
        sa.Column("uploaded_by_id", sa.Integer, sa.ForeignKey("team_members.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_client_files_client_id", "client_files", ["client_id"])
    op.create_index("ix_client_files_category", "client_files", ["category"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("recipient_id", sa.Integer, sa.ForeignKey("team_members.id", ondelete="CASCADE")),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text),
        sa.Column("link_url", sa.String(512)),
        sa.Column("ref_type", sa.String(20)),
        sa.Column("ref_id", sa.Integer),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("recipient_id", "kind", "ref_type", "ref_id", name="uq_notification_dedup"),
    )
    op.create_index("ix_notifications_recipient_id", "notifications", ["recipient_id"])
    op.create_index("ix_notifications_read_at", "notifications", ["read_at"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("client_files")
    op.drop_table("tasks")
    op.drop_table("team_members")
