"""Endpoints do módulo de projeto — tasks, files, notifications, team members."""
from __future__ import annotations

import mimetypes
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.supabase import STORAGE_BUCKET_FILES, publicize_path, supabase_admin_available, upload_to_storage
from app.models.client import Client
from app.models.project import ClientFile, Notification, Task, TeamMember
from app.schemas.project import (
    FileCreateExternal,
    FileRead,
    FileUpdate,
    NotificationRead,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    TeamMemberCreate,
    TeamMemberRead,
    TeamMemberUpdate,
)


router = APIRouter(tags=["project"])


def _client_or_404(db: Session, slug: str) -> Client:
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "client not found")
    return c


def _task_to_read(t: Task) -> TaskRead:
    return TaskRead(
        id=t.id,
        client_id=t.client_id,
        title=t.title,
        description=t.description,
        due_at=t.due_at,
        duration_min=t.duration_min,
        status=t.status,
        priority=t.priority,
        scope=t.scope,
        assignee_id=t.assignee_id,
        assignee_name=t.assignee.name if t.assignee else None,
        assignee_color=t.assignee.avatar_color if t.assignee else None,
        ai_scheduled=t.ai_scheduled,
        ai_context=t.ai_context,
        completed_at=t.completed_at,
        created_at=t.created_at,
    )


def _file_to_read(db: Session, f: ClientFile) -> FileRead:
    uploader_name = None
    if f.uploaded_by_id:
        m = db.query(TeamMember).filter(TeamMember.id == f.uploaded_by_id).first()
        uploader_name = m.name if m else None
    # URL de download: se external, retorna external; senão gera URL pública do Supabase
    download_url = f.external_url
    if not download_url and f.storage_path:
        download_url = publicize_path(STORAGE_BUCKET_FILES, f.storage_path)
    return FileRead(
        id=f.id, client_id=f.client_id, name=f.name,
        storage_path=f.storage_path, external_url=f.external_url,
        category=f.category, mime_type=f.mime_type, size_bytes=f.size_bytes,
        description=f.description, uploaded_by_id=f.uploaded_by_id,
        uploaded_by_name=uploader_name,
        created_at=f.created_at, download_url=download_url,
    )


# ═════════════════════════════════════════════════════════════════════════
#  TEAM MEMBERS
# ═════════════════════════════════════════════════════════════════════════

@router.get("/api/team", response_model=list[TeamMemberRead])
def list_members(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(TeamMember)
    if not include_inactive:
        q = q.filter(TeamMember.is_active.is_(True))
    return q.order_by(TeamMember.name).all()


@router.post("/api/team", response_model=TeamMemberRead, status_code=201)
def create_member(payload: TeamMemberCreate, db: Session = Depends(get_db)):
    if db.query(TeamMember).filter(TeamMember.email == payload.email).first():
        raise HTTPException(409, f"Already have a member with email {payload.email}")
    m = TeamMember(**payload.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return m


@router.patch("/api/team/{member_id}", response_model=TeamMemberRead)
def update_member(member_id: int, payload: TeamMemberUpdate, db: Session = Depends(get_db)):
    m = db.query(TeamMember).filter(TeamMember.id == member_id).first()
    if not m:
        raise HTTPException(404, "member not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.add(m); db.commit(); db.refresh(m)
    return m


# ═════════════════════════════════════════════════════════════════════════
#  TAREFAS
# ═════════════════════════════════════════════════════════════════════════

@router.get("/api/clients/{slug}/tasks", response_model=list[TaskRead])
def list_tasks(
    slug: str,
    status: str | None = Query(None, description="filtra por status"),
    upcoming_days: int | None = Query(None, description="só próximas N dias (inclui sem data)"),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    q = db.query(Task).filter(Task.client_id == c.id)
    if status:
        q = q.filter(Task.status == status)
    if upcoming_days:
        until = datetime.now(timezone.utc) + timedelta(days=upcoming_days)
        q = q.filter(or_(Task.due_at.is_(None), Task.due_at <= until))
    rows = q.order_by(
        Task.status != "arquivado",
        Task.due_at.asc().nullslast(),
        Task.id.desc(),
    ).all()
    return [_task_to_read(t) for t in rows]


@router.post("/api/clients/{slug}/tasks", response_model=TaskRead, status_code=201)
def create_task(slug: str, payload: TaskCreate, db: Session = Depends(get_db)):
    c = _client_or_404(db, slug)
    t = Task(client_id=c.id, **payload.model_dump())
    db.add(t); db.commit(); db.refresh(t)

    # Cria notificação se foi atribuída a alguém
    if t.assignee_id:
        n = Notification(
            recipient_id=t.assignee_id,
            client_id=c.id,
            kind="task_assigned",
            title=f"Nova tarefa: {t.title}",
            body=f"Cliente {c.name}" + (f" · vence {t.due_at.strftime('%d/%m %H:%M')}" if t.due_at else ""),
            link_url=f"/c/{slug}/project?task={t.id}",
            ref_type="task", ref_id=t.id,
        )
        db.add(n); db.commit()
    return _task_to_read(t)


@router.patch("/api/tasks/{task_id}", response_model=TaskRead)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "task not found")
    data = payload.model_dump(exclude_unset=True)
    # Auto-set completed_at quando status vira "publicado"
    if data.get("status") == "publicado" and not t.completed_at:
        data["completed_at"] = datetime.now(timezone.utc)
    for k, v in data.items():
        setattr(t, k, v)
    db.add(t); db.commit(); db.refresh(t)
    return _task_to_read(t)


@router.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "task not found")
    db.delete(t); db.commit()


# ═════════════════════════════════════════════════════════════════════════
#  ARQUIVOS
# ═════════════════════════════════════════════════════════════════════════

ACCEPTED_MIME_PREFIXES = ("image/", "video/")
ACCEPTED_EXACT = {
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-excel",
    "text/csv", "text/plain",
    "application/zip",
    "application/json",
}


def _accepts_mime(m: str | None) -> bool:
    if not m:
        return True  # deixa passar se navegador não mandou mime
    if any(m.startswith(p) for p in ACCEPTED_MIME_PREFIXES):
        return True
    return m in ACCEPTED_EXACT


@router.get("/api/clients/{slug}/files", response_model=list[FileRead])
def list_files(slug: str, category: str | None = Query(None), db: Session = Depends(get_db)):
    c = _client_or_404(db, slug)
    q = db.query(ClientFile).filter(ClientFile.client_id == c.id)
    if category:
        q = q.filter(ClientFile.category == category)
    rows = q.order_by(ClientFile.created_at.desc()).all()
    return [_file_to_read(db, f) for f in rows]


@router.post("/api/clients/{slug}/files", response_model=FileRead, status_code=201)
async def upload_file(
    slug: str,
    file: UploadFile = File(...),
    category: str = Form("outros"),
    description: str | None = Form(None),
    uploaded_by_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    c = _client_or_404(db, slug)
    if not supabase_admin_available():
        raise HTTPException(503, "Supabase Storage não configurado — defina SUPABASE_SERVICE_ROLE_KEY")

    content = await file.read()
    if not _accepts_mime(file.content_type):
        raise HTTPException(400, f"Tipo de arquivo não suportado: {file.content_type}")
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(413, "Arquivo acima de 100MB")

    ext = os.path.splitext(file.filename or "")[1] or mimetypes.guess_extension(file.content_type or "") or ""
    storage_path = f"{slug}/{datetime.now().strftime('%Y/%m')}/{secrets.token_hex(6)}{ext}"
    upload_to_storage(STORAGE_BUCKET_FILES, storage_path, content, file.content_type or "application/octet-stream")

    f = ClientFile(
        client_id=c.id,
        name=file.filename or storage_path,
        storage_path=storage_path,
        category=category,
        mime_type=file.content_type,
        size_bytes=len(content),
        description=description,
        uploaded_by_id=uploaded_by_id,
    )
    db.add(f); db.commit(); db.refresh(f)

    # Notificação global — todo time vê na bell
    n = Notification(
        recipient_id=None, client_id=c.id, kind="file_uploaded",
        title=f"Novo arquivo: {f.name}",
        body=f"Categoria: {category} · Cliente {c.name}",
        link_url=f"/c/{slug}/project?tab=files",
        ref_type="file", ref_id=f.id,
    )
    db.add(n); db.commit()
    return _file_to_read(db, f)


@router.post("/api/clients/{slug}/files/external", response_model=FileRead, status_code=201)
def add_external_file(slug: str, payload: FileCreateExternal, db: Session = Depends(get_db)):
    c = _client_or_404(db, slug)
    f = ClientFile(
        client_id=c.id, name=payload.name, external_url=payload.external_url,
        category=payload.category, description=payload.description,
    )
    db.add(f); db.commit(); db.refresh(f)
    return _file_to_read(db, f)


@router.patch("/api/files/{file_id}", response_model=FileRead)
def update_file(file_id: int, payload: FileUpdate, db: Session = Depends(get_db)):
    f = db.query(ClientFile).filter(ClientFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "file not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(f, k, v)
    db.add(f); db.commit(); db.refresh(f)
    return _file_to_read(db, f)


@router.delete("/api/files/{file_id}", status_code=204)
def delete_file(file_id: int, db: Session = Depends(get_db)):
    f = db.query(ClientFile).filter(ClientFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "file not found")
    # Apaga do Storage se for upload (não external)
    if f.storage_path and supabase_admin_available():
        from app.core.supabase import delete_from_storage
        try:
            delete_from_storage(STORAGE_BUCKET_FILES, f.storage_path)
        except Exception:
            pass  # não bloqueia a exclusão do row
    db.delete(f); db.commit()


# ═════════════════════════════════════════════════════════════════════════
#  NOTIFICAÇÕES
# ═════════════════════════════════════════════════════════════════════════

@router.get("/api/notifications", response_model=list[NotificationRead])
def list_notifications(
    recipient_id: int | None = Query(None),
    unread_only: bool = False,
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Notification, Client.slug).outerjoin(Client, Notification.client_id == Client.id)
    if recipient_id:
        q = q.filter(or_(Notification.recipient_id == recipient_id, Notification.recipient_id.is_(None)))
    if unread_only:
        q = q.filter(Notification.read_at.is_(None))
    rows = q.order_by(Notification.created_at.desc()).limit(limit).all()
    out = []
    for n, slug in rows:
        out.append(NotificationRead(
            id=n.id, recipient_id=n.recipient_id, client_id=n.client_id, client_slug=slug,
            kind=n.kind, title=n.title, body=n.body, link_url=n.link_url,
            ref_type=n.ref_type, ref_id=n.ref_id,
            read_at=n.read_at, created_at=n.created_at,
        ))
    return out


@router.post("/api/notifications/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(404, "notification not found")
    n.read_at = datetime.now(timezone.utc)
    db.add(n); db.commit()
    return {"ok": True}


@router.post("/api/notifications/mark-all-read")
def mark_all_read(recipient_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(Notification).filter(Notification.read_at.is_(None))
    if recipient_id:
        q = q.filter(or_(Notification.recipient_id == recipient_id, Notification.recipient_id.is_(None)))
    now = datetime.now(timezone.utc)
    updated = q.update({Notification.read_at: now}, synchronize_session=False)
    db.commit()
    return {"updated": updated}


@router.get("/api/notifications/count")
def count_unread(recipient_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(func.count(Notification.id)).filter(Notification.read_at.is_(None))
    if recipient_id:
        q = q.filter(or_(Notification.recipient_id == recipient_id, Notification.recipient_id.is_(None)))
    return {"count": int(q.scalar() or 0)}
