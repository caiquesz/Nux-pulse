"""add platform + task_type to tasks; simplify status

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("platform", sa.String(20)))
    op.add_column("tasks", sa.Column("task_type", sa.String(20)))
    # Mapeia status antigo → novo (compat — tabela ainda pode estar vazia)
    op.execute("UPDATE tasks SET status='todo'    WHERE status='briefing'")
    op.execute("UPDATE tasks SET status='doing'   WHERE status='producao'")
    op.execute("UPDATE tasks SET status='waiting' WHERE status='aprovacao'")
    op.execute("UPDATE tasks SET status='done'    WHERE status IN ('publicado','arquivado')")
    op.create_index("ix_tasks_platform", "tasks", ["platform"])
    op.create_index("ix_tasks_task_type", "tasks", ["task_type"])


def downgrade() -> None:
    op.drop_index("ix_tasks_task_type", "tasks")
    op.drop_index("ix_tasks_platform", "tasks")
    op.drop_column("tasks", "task_type")
    op.drop_column("tasks", "platform")
