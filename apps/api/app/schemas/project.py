"""Schemas Pydantic do módulo de projeto — tasks, files, notifications, team."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr


# ── Team ──────────────────────────────────────────────────────────────────

class TeamMemberCreate(BaseModel):
    email: EmailStr
    name: str
    role: str | None = None
    avatar_color: str | None = None


class TeamMemberUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    avatar_color: str | None = None
    is_active: bool | None = None


class TeamMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: str | None
    avatar_color: str | None
    is_active: bool


# ── Tasks ─────────────────────────────────────────────────────────────────

TaskStatus = Literal["briefing", "producao", "aprovacao", "publicado", "arquivado"]
TaskPriority = Literal["baixa", "media", "alta", "urgente"]
TaskScope = Literal["cliente", "interno"]


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    duration_min: int | None = None
    status: TaskStatus = "briefing"
    priority: TaskPriority = "media"
    scope: TaskScope = "cliente"
    assignee_id: int | None = None
    ai_scheduled: bool = False
    ai_context: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_at: datetime | None = None
    duration_min: int | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    scope: TaskScope | None = None
    assignee_id: int | None = None
    ai_scheduled: bool | None = None
    ai_context: str | None = None
    completed_at: datetime | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    title: str
    description: str | None
    due_at: datetime | None
    duration_min: int | None
    status: str
    priority: str
    scope: str
    assignee_id: int | None
    assignee_name: str | None = None
    assignee_color: str | None = None
    ai_scheduled: bool
    ai_context: str | None
    completed_at: datetime | None
    created_at: datetime


# ── Files ─────────────────────────────────────────────────────────────────

FileCategory = Literal["briefing", "id_visual", "fluxograma", "relatorio", "contrato", "outros"]


class FileCreateExternal(BaseModel):
    """Quando o arquivo é só um link (Figma, Drive, Dropbox)."""
    name: str
    external_url: str
    category: FileCategory = "outros"
    description: str | None = None


class FileUpdate(BaseModel):
    name: str | None = None
    category: FileCategory | None = None
    description: str | None = None


class FileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    name: str
    storage_path: str | None
    external_url: str | None
    category: str
    mime_type: str | None
    size_bytes: int | None
    description: str | None
    uploaded_by_id: int | None
    uploaded_by_name: str | None = None
    created_at: datetime
    # URL assinada/pública de download (calculada no endpoint)
    download_url: str | None = None


# ── Notifications ────────────────────────────────────────────────────────

class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    recipient_id: int | None
    client_id: int | None
    client_slug: str | None = None
    kind: str
    title: str
    body: str | None
    link_url: str | None
    ref_type: str | None
    ref_id: int | None
    read_at: datetime | None
    created_at: datetime
