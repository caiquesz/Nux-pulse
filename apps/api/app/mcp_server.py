"""MCP server do NUX Pulse — expõe tools pro Claude.ai, Claude Desktop e
qualquer cliente MCP acessar o Pulse como ferramenta nativa.

Tools expostas:
  - list_clients()                      → lista todos os clientes Pulse
  - list_connections(slug)              → conexões Meta/Google de um cliente
  - create_task(slug, title, ...)       → cria task no Planejamento
  - list_tasks(slug, status?)           → lista tasks de um cliente
  - update_task_status(task_id, status) → move task entre colunas
  - get_meta_overview(slug, days?)      → KPIs Meta últimos N dias
  - list_meta_campaigns(slug, days?)    → lista campanhas Meta

Autenticação: usa o mesmo X-API-Key do resto da API. O transport MCP passa
headers do cliente pro server via starlette request, e validamos lá.

Mount em main.py: app.mount("/mcp", mcp_app). Claude Desktop conecta em
https://nux-pulse-production.up.railway.app/mcp (com header X-API-Key).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastmcp import FastMCP
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.client import Client
from app.models.connection import AccountConnection, Platform
from app.models.meta import MetaCampaign, MetaInsightsDaily
from app.models.project import Notification, Task


mcp = FastMCP(
    name="nux-pulse",
    instructions=(
        "Servidor MCP do NUX Pulse — dashboard de marketing analytics com "
        "gestão de tarefas por cliente. Use para registrar automaticamente "
        "ações feitas em Meta Ads / Google Ads como tasks no Planejamento, "
        "consultar KPIs, e listar campanhas. Slugs de cliente conhecidos: "
        "segredos-de-minas, toque-mineiro, forbli, evler, luana-corretora, "
        "resende-decor."
    ),
)


# ─── helpers ────────────────────────────────────────────────────────────

def _client_or_error(db: Session, slug: str) -> Client:
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise ValueError(f"client not found: {slug}")
    return c


def _dec(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    return v


# ─── tools ──────────────────────────────────────────────────────────────

@mcp.tool
def list_clients() -> list[dict]:
    """Lista todos os clientes cadastrados no Pulse (ativos + inativos).
    Retorna `slug`, `name`, `monthly_budget`, `is_active`.
    Use o `slug` como identificador em todas as outras tools.
    """
    db = SessionLocal()
    try:
        rows = db.query(Client).order_by(Client.is_active.desc(), Client.name).all()
        return [
            {
                "id": c.id,
                "slug": c.slug,
                "name": c.name,
                "monthly_budget": _dec(c.monthly_budget),
                "monthly_revenue_goal": _dec(c.monthly_revenue_goal),
                "is_active": c.is_active,
            }
            for c in rows
        ]
    finally:
        db.close()


@mcp.tool
def list_connections(slug: str) -> list[dict]:
    """Lista conexões de plataforma (Meta / Google) de um cliente.
    Útil pra mapear `meta_account_id` / `google_customer_id` → cliente Pulse.

    Args:
        slug: identificador do cliente (ex.: "segredos-de-minas")
    """
    db = SessionLocal()
    try:
        c = _client_or_error(db, slug)
        rows = (
            db.query(AccountConnection)
            .filter(AccountConnection.client_id == c.id)
            .all()
        )
        return [
            {
                "id": r.id,
                "platform": r.platform.value if hasattr(r.platform, "value") else str(r.platform),
                "external_account_id": r.external_account_id,
                "display_name": r.display_name,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "last_sync_at": r.last_sync_at.isoformat() if r.last_sync_at else None,
                "last_error": r.last_error,
            }
            for r in rows
        ]
    finally:
        db.close()


@mcp.tool
def create_task(
    slug: str,
    title: str,
    description: str | None = None,
    status: str = "done",
    priority: str = "media",
    platform: str | None = None,
    task_type: str | None = None,
    ai_context: str | None = None,
    due_at_iso: str | None = None,
) -> dict:
    """Cria uma tarefa no Planejamento do cliente.

    USE ESTA TOOL para REGISTRAR toda ação executada em plataformas de ads
    (pausar campanha, criar, duplicar, trocar UTM, analisar performance,
    adicionar negativas, etc). Marca automaticamente `ai_scheduled=true`.

    Args:
        slug: cliente (ex.: "resende-decor")
        title: título curto da ação (ex.: "Pausei campanha: Segredos BR 2026")
        description: markdown com contexto — antes/depois, IDs, motivos, números
        status: "todo" | "doing" | "waiting" | "done" (default "done")
        priority: "baixa" | "media" | "alta" | "urgente" (default "media")
        platform: "meta" | "google" | "tiktok" | "linkedin" | "pinterest"
                  | "geral" | "outro"
        task_type: "briefing" | "criativo" | "lancamento" | "otimizacao"
                   | "relatorio" | "reuniao" | "aprovacao" | "analise" | "outro"
        ai_context: JSON ou texto livre com raw da ação (IDs, valores antes/depois)
        due_at_iso: opcional, deadline em ISO-8601 (ex.: "2026-04-25T15:00:00Z")
    """
    db = SessionLocal()
    try:
        c = _client_or_error(db, slug)
        due_at = None
        if due_at_iso:
            due_at = datetime.fromisoformat(due_at_iso.replace("Z", "+00:00"))

        t = Task(
            client_id=c.id,
            title=title[:200],
            description=description,
            status=status,
            priority=priority,
            platform=platform,
            task_type=task_type,
            ai_scheduled=True,
            ai_context=ai_context,
            due_at=due_at,
            completed_at=datetime.now(timezone.utc) if status == "done" else None,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return {
            "ok": True,
            "id": t.id,
            "client_slug": slug,
            "title": t.title,
            "status": t.status,
            "url": f"https://nux-pulse.vercel.app/c/{slug}/project?task={t.id}",
        }
    finally:
        db.close()


@mcp.tool
def list_tasks(
    slug: str,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Lista tarefas de um cliente, mais recentes primeiro.

    Args:
        slug: identificador do cliente
        status: filtra por status ("todo" | "doing" | "waiting" | "done")
        limit: máx de tarefas retornadas (default 50)
    """
    db = SessionLocal()
    try:
        c = _client_or_error(db, slug)
        q = db.query(Task).filter(Task.client_id == c.id)
        if status:
            q = q.filter(Task.status == status)
        rows = q.order_by(Task.id.desc()).limit(limit).all()
        return [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "platform": t.platform,
                "task_type": t.task_type,
                "due_at": t.due_at.isoformat() if t.due_at else None,
                "ai_scheduled": t.ai_scheduled,
                "created_at": (t.created_at.isoformat() if getattr(t, "created_at", None) else None),
            }
            for t in rows
        ]
    finally:
        db.close()


@mcp.tool
def update_task_status(task_id: int, status: str) -> dict:
    """Atualiza o status de uma task existente.

    Args:
        task_id: ID da task (obtido via list_tasks ou create_task)
        status: "todo" | "doing" | "waiting" | "done"
    """
    db = SessionLocal()
    try:
        t = db.query(Task).filter(Task.id == task_id).first()
        if not t:
            raise ValueError(f"task not found: {task_id}")
        t.status = status
        if status == "done" and not t.completed_at:
            t.completed_at = datetime.now(timezone.utc)
        if status != "done":
            t.completed_at = None
        db.add(t)
        db.commit()
        db.refresh(t)
        return {"ok": True, "id": t.id, "status": t.status}
    finally:
        db.close()


@mcp.tool
def get_meta_overview(slug: str, days: int = 7) -> dict:
    """KPIs consolidados do Meta Ads de um cliente (últimos N dias).
    Retorna spend, impressions, clicks, ctr, cpc, messages, leads, purchases,
    revenue, roas.

    Args:
        slug: identificador do cliente
        days: janela em dias (default 7)
    """
    db = SessionLocal()
    try:
        c = _client_or_error(db, slug)
        until = datetime.now(timezone.utc).date()
        since = until - timedelta(days=days - 1)
        base = (
            db.query(
                func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
                func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
                func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
                func.coalesce(func.sum(MetaInsightsDaily.messages), 0).label("messages"),
                func.coalesce(func.sum(MetaInsightsDaily.leads), 0).label("leads"),
                func.coalesce(func.sum(MetaInsightsDaily.purchases), 0).label("purchases"),
                func.coalesce(func.sum(MetaInsightsDaily.revenue), 0).label("revenue"),
            )
            .filter(
                MetaInsightsDaily.client_id == c.id,
                MetaInsightsDaily.date >= since,
                MetaInsightsDaily.date <= until,
                MetaInsightsDaily.level == "account",
                MetaInsightsDaily.breakdown_key == "none",
            )
            .one()
        )
        spend = float(base.spend or 0)
        impressions = int(base.impressions or 0)
        clicks = int(base.clicks or 0)
        revenue = float(base.revenue or 0)
        return {
            "client_slug": slug,
            "period_days": days,
            "since": since.isoformat(),
            "until": until.isoformat(),
            "spend": round(spend, 2),
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round((clicks / impressions * 100) if impressions else 0, 2),
            "cpc": round((spend / clicks) if clicks else 0, 2),
            "messages": int(base.messages or 0),
            "leads": int(base.leads or 0),
            "purchases": int(base.purchases or 0),
            "revenue": round(revenue, 2),
            "roas": round((revenue / spend) if spend else 0, 2),
        }
    finally:
        db.close()


@mcp.tool
def list_meta_campaigns(slug: str, days: int = 30, top: int = 20) -> list[dict]:
    """Lista campanhas Meta de um cliente com KPIs dos últimos N dias,
    ordenadas por gasto descendente.

    Args:
        slug: identificador do cliente
        days: janela de insights (default 30)
        top: máx campanhas retornadas (default 20)
    """
    db = SessionLocal()
    try:
        c = _client_or_error(db, slug)
        until = datetime.now(timezone.utc).date()
        since = until - timedelta(days=days - 1)

        rows = (
            db.query(
                MetaCampaign.id,
                MetaCampaign.name,
                MetaCampaign.effective_status,
                MetaCampaign.objective,
                func.coalesce(func.sum(MetaInsightsDaily.spend), 0).label("spend"),
                func.coalesce(func.sum(MetaInsightsDaily.impressions), 0).label("impressions"),
                func.coalesce(func.sum(MetaInsightsDaily.clicks), 0).label("clicks"),
            )
            .outerjoin(
                MetaInsightsDaily,
                and_(
                    MetaInsightsDaily.object_id == MetaCampaign.id,
                    MetaInsightsDaily.level == "campaign",
                    MetaInsightsDaily.breakdown_key == "none",
                    MetaInsightsDaily.date >= since,
                    MetaInsightsDaily.date <= until,
                ),
            )
            .filter(MetaCampaign.client_id == c.id)
            .group_by(MetaCampaign.id, MetaCampaign.name, MetaCampaign.effective_status, MetaCampaign.objective)
            .order_by(func.coalesce(func.sum(MetaInsightsDaily.spend), 0).desc())
            .limit(top)
            .all()
        )
        return [
            {
                "id": r.id,
                "name": r.name,
                "status": r.effective_status,
                "objective": r.objective,
                "spend": round(float(r.spend or 0), 2),
                "impressions": int(r.impressions or 0),
                "clicks": int(r.clicks or 0),
                "ctr": round((float(r.clicks or 0) / float(r.impressions or 0) * 100) if r.impressions else 0, 2),
            }
            for r in rows
        ]
    finally:
        db.close()
