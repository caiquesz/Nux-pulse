"""Gestão de projeto: tarefas, arquivos, notificações e membros da equipe.

Separado dos models existentes (meta/google/client) pra manter a coisa
coesa — tudo que é "gestão interna da agência" vive aqui.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


# ═══════════════════════════════════════════════════════════════════════════
#  MEMBROS DA EQUIPE
#  Simples por enquanto — sem login full. Serve pra atribuir tasks e
#  mostrar "quem fez o quê". Login real pode vir em sprint futuro.
# ═══════════════════════════════════════════════════════════════════════════

class TeamMember(Base, TimestampMixin):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str | None] = mapped_column(String(60))  # ex: "Diretor", "Gestor", "Designer"
    avatar_color: Mapped[str | None] = mapped_column(String(16))  # cor usada no avatar/chip
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tasks_assigned = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")


# ═══════════════════════════════════════════════════════════════════════════
#  TAREFAS
# ═══════════════════════════════════════════════════════════════════════════

class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Quando fazer (opcional — task sem data vira "backlog")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_min: Mapped[int | None] = mapped_column(Integer)  # usado pra time-block

    # Workflow
    status: Mapped[str] = mapped_column(
        String(20), default="briefing", nullable=False
    )  # briefing | producao | aprovacao | publicado | arquivado
    priority: Mapped[str] = mapped_column(
        String(10), default="media", nullable=False
    )  # baixa | media | alta | urgente
    scope: Mapped[str] = mapped_column(
        String(10), default="cliente", nullable=False
    )  # cliente | interno

    # Responsável
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("team_members.id", ondelete="SET NULL"))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("team_members.id", ondelete="SET NULL"))

    # Claude Cowork
    ai_scheduled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_context: Mapped[str | None] = mapped_column(Text)  # notas/prompt que Claude usa

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignee = relationship("TeamMember", back_populates="tasks_assigned", foreign_keys=[assignee_id])
    client = relationship("Client")


# ═══════════════════════════════════════════════════════════════════════════
#  ARQUIVOS POR CLIENTE
#  Supabase Storage guarda o binário; aqui só metadata.
# ═══════════════════════════════════════════════════════════════════════════

class ClientFile(Base, TimestampMixin):
    __tablename__ = "client_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    # Caminho no Supabase Storage (bucket fixo client-files). Se external_url, fica NULL.
    storage_path: Mapped[str | None] = mapped_column(String(512))
    external_url: Mapped[str | None] = mapped_column(String(1024))  # link Drive/Figma

    category: Mapped[str] = mapped_column(
        String(20), default="outros", nullable=False
    )  # briefing | id_visual | fluxograma | relatorio | contrato | outros

    mime_type: Mapped[str | None] = mapped_column(String(80))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)

    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("team_members.id", ondelete="SET NULL"))

    client = relationship("Client")
    uploaded_by = relationship("TeamMember", foreign_keys=[uploaded_by_id])


# ═══════════════════════════════════════════════════════════════════════════
#  NOTIFICAÇÕES IN-APP
#  Geradas por eventos (task atribuída, due próximo, arquivo subido).
#  Lidas via bell do topbar.
# ═══════════════════════════════════════════════════════════════════════════

class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Opcional: notificação pode ser global (sem recipient) ou dirigida a um membro.
    recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )

    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    # task_assigned | task_due_soon | task_overdue | file_uploaded | task_completed | ai_action
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link_url: Mapped[str | None] = mapped_column(String(512))  # pra onde o bell leva

    # Referência ao objeto relacionado (task ou file) — guarda ID só, não FK rígida.
    ref_type: Mapped[str | None] = mapped_column(String(20))  # "task" | "file"
    ref_id: Mapped[int | None] = mapped_column(Integer)

    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    __table_args__ = (
        UniqueConstraint("recipient_id", "kind", "ref_type", "ref_id", name="uq_notification_dedup"),
    )
