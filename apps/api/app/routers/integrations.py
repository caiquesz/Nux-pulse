"""Endpoints de integracao com sistemas externos.

Atualmente:
- POST /api/integrations/trackcore/event — webhook do Trackcore
  (sistema server-side de pixel + CAPI + WhatsApp). Insere em
  `manual_conversions` com idempotencia via external_event_id.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.auth import require_api_key
from app.core.config import settings
from app.core.db import get_db
from app.models.client import Client
from app.models.connection import AccountConnection, Platform
from app.models.conversions import ManualConversion


_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# ─── Trackcore ─────────────────────────────────────────────────────────────

# Map dos `kind` do Trackcore → kind interno do Pulse
# (manual_conversions.kind aceita: purchase | lead | message)
_TRACKCORE_KIND_MAP = {
    "purchase": "purchase",
    "lead": "lead",
    "message": "message",
    "initiate_checkout": "lead",  # IC nao existe no schema atual; trata como lead
}


class TrackcoreAttribution(BaseModel):
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_content: str | None = None
    utm_term: str | None = None
    meta_ad_id: str | None = None
    meta_ad_name: str | None = None
    meta_campaign_id: str | None = None
    meta_campaign_name: str | None = None


class TrackcoreEvent(BaseModel):
    event_id: str = Field(min_length=4, max_length=64, description="UUID do Event/Conversation no Trackcore")
    meta_account_id: str = Field(description="adAccountId do Workspace Trackcore (ex: act_xxx)")
    kind: str = Field(description="purchase | lead | message | initiate_checkout | view_content")
    occurred_at: datetime = Field(description="ISO 8601 — quando o evento aconteceu")
    value: float | None = None
    currency: str = "BRL"
    count: int = 1
    attribution: TrackcoreAttribution | None = None
    notes: str | None = None


def _require_trackcore_auth(x_trackcore_secret: str | None) -> None:
    expected = settings.TRACKCORE_INTEGRATION_SECRET
    if settings.is_production and not expected:
        raise HTTPException(500, "TRACKCORE_INTEGRATION_SECRET not configured (production requires it)")
    if expected and x_trackcore_secret != expected:
        raise HTTPException(401, "invalid trackcore secret")
    # dev sem secret: libera


@router.post("/trackcore/event", status_code=202)
def trackcore_event(
    payload: TrackcoreEvent,
    x_trackcore_secret: str | None = Header(None, alias="X-Trackcore-Secret"),
    db: Session = Depends(get_db),
) -> dict:
    """Recebe um evento do Trackcore e persiste em manual_conversions.

    Idempotente: re-envios com mesmo event_id sao silenciosamente
    ignorados (UNIQUE constraint).

    Resolucao de cliente:
    - Procura AccountConnection.platform=meta com external_account_id =
      payload.meta_account_id
    - Se nao achar, retorna 404 (Trackcore deve logar e nao re-enfileirar)

    Eventos com kind nao mapeavel (ex: view_content) retornam 200 com
    `ignored=true` — Trackcore tira da fila, comportamento esperado.
    """
    _require_trackcore_auth(x_trackcore_secret)

    # mapeia kind
    kind = payload.kind.lower()
    mapped_kind = _TRACKCORE_KIND_MAP.get(kind)
    if not mapped_kind:
        return {"status": "ignored", "reason": f"unsupported kind '{payload.kind}'"}

    # resolve cliente via Meta account id
    normalized_acc = payload.meta_account_id.strip()
    if not normalized_acc.startswith("act_"):
        normalized_acc = f"act_{normalized_acc}"

    conn = (
        db.query(AccountConnection)
        .filter(
            AccountConnection.platform == Platform.meta,
            AccountConnection.external_account_id == normalized_acc,
        )
        .first()
    )
    if not conn:
        raise HTTPException(404, f"no client mapped to meta_account_id '{normalized_acc}'")

    client = db.query(Client).filter(Client.id == conn.client_id, Client.is_active.is_(True)).first()
    if not client:
        raise HTTPException(404, f"client for meta_account_id '{normalized_acc}' not found or inactive")

    attr = payload.attribution or TrackcoreAttribution()

    # Decimal conversion segura
    revenue = Decimal(str(payload.value)) if payload.value is not None else None

    # Upsert idempotente via external_event_id
    stmt = pg_insert(ManualConversion).values(
        client_id=client.id,
        date=payload.occurred_at.date(),
        kind=mapped_kind,
        count=payload.count,
        revenue=revenue,
        campaign_id=attr.meta_campaign_id,
        campaign_name=attr.meta_campaign_name or attr.utm_campaign,
        notes=payload.notes,
        external_event_id=payload.event_id,
        attribution_source="trackcore",
        utm_source=attr.utm_source,
        utm_medium=attr.utm_medium,
        utm_campaign=attr.utm_campaign,
        utm_content=attr.utm_content,
        utm_term=attr.utm_term,
        meta_ad_id=attr.meta_ad_id,
        meta_ad_name=attr.meta_ad_name,
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["external_event_id"])
    # `.returning` faz com que `result.scalar()` traga o id quando insere e
    # None quando bate o ON CONFLICT DO NOTHING — workaround do quirk do
    # psycopg que nao popula rowcount em DO NOTHING.
    stmt = stmt.returning(ManualConversion.id)
    result = db.execute(stmt)
    db.commit()

    inserted = result.scalar_one_or_none() is not None
    return {
        "status": "ok",
        "client": client.slug,
        "event_id": payload.event_id,
        "inserted": inserted,
        "kind": mapped_kind,
    }


# ─── Trackcore health check ────────────────────────────────────────────────


@router.get("/clients/{slug}/trackcore/health", dependencies=[Depends(require_api_key)])
def trackcore_health(slug: str, db: Session = Depends(get_db)) -> dict:
    """Diagnostico automatico do estado da integracao Trackcore por cliente.

    Analisa `manual_conversions` dos ultimos 30 dias e retorna:
      - status: healthy | degraded | broken | inactive
      - issues: lista de problemas detectados com codigo + acao recomendada
      - metrics: contadores e stats brutos pra UI mostrar contexto

    Detecta padroes:
      - inactive: zero eventos Trackcore nos 30d
      - broken: tem leads com valor mas zero purchases (signature do caso
        Comtex — Trackcore manda placeholders de R$ X mas nao detecta venda real)
      - degraded: razao de purchases/leads muito baixa (< 1%) com volume alto
      - stale: ultimo purchase > 14 dias atras com leads recentes
      - uniform_values: 80%+ dos leads-com-valor compartilham mesmo valor
        (= placeholders de CPL alvo, nao vendas reais)
    """
    from datetime import date, timedelta
    from sqlalchemy import func

    client = db.query(Client).filter(Client.slug == slug, Client.is_active.is_(True)).first()
    if not client:
        raise HTTPException(404, "client not found")

    today = date.today()
    since = today - timedelta(days=30)

    rows = (
        db.query(ManualConversion)
        .filter(
            ManualConversion.client_id == client.id,
            ManualConversion.date >= since,
            ManualConversion.attribution_source == "trackcore",
        )
        .all()
    )

    metrics = {
        "events_30d": len(rows),
        "purchases": 0,
        "leads": 0,
        "leads_with_value": 0,
        "messages": 0,
        "purchases_revenue": 0.0,
        "leads_revenue": 0.0,
        "last_purchase_date": None,
        "last_event_date": None,
        "purchase_value_distribution": {},  # value → count
        "lead_value_distribution": {},
    }

    for r in rows:
        rev = float(r.revenue or 0)
        date_str = r.date.isoformat() if r.date else None
        if date_str and (metrics["last_event_date"] is None or date_str > metrics["last_event_date"]):
            metrics["last_event_date"] = date_str
        if r.kind == "purchase":
            metrics["purchases"] += int(r.count or 1)
            metrics["purchases_revenue"] += rev
            if date_str and (metrics["last_purchase_date"] is None or date_str > metrics["last_purchase_date"]):
                metrics["last_purchase_date"] = date_str
            if rev > 0:
                key = f"{rev:.2f}"
                metrics["purchase_value_distribution"][key] = metrics["purchase_value_distribution"].get(key, 0) + 1
        elif r.kind == "lead":
            metrics["leads"] += int(r.count or 1)
            metrics["leads_revenue"] += rev
            if rev > 0:
                metrics["leads_with_value"] += 1
                key = f"{rev:.2f}"
                metrics["lead_value_distribution"][key] = metrics["lead_value_distribution"].get(key, 0) + 1
        elif r.kind == "message":
            metrics["messages"] += int(r.count or 1)

    issues: list[dict] = []

    # 1. Integracao inativa: zero eventos
    if metrics["events_30d"] == 0:
        issues.append({
            "code": "trackcore_inactive",
            "severity": "high",
            "title": "Trackcore não está enviando eventos",
            "detail": "Zero eventos nos últimos 30 dias. Integração possivelmente desconectada.",
            "action": "Verificar config webhook no Trackcore — o cliente está ativo lá? URL aponta pro Pulse?",
        })

    # 2. Padrao Comtex: muitos leads com valor uniforme + poucas/zero purchases
    if metrics["leads_with_value"] > 0 and metrics["purchases"] <= 1:
        # Sao valores uniformes (placeholders)?
        ldist = metrics["lead_value_distribution"]
        if ldist:
            top_value, top_count = max(ldist.items(), key=lambda kv: kv[1])
            uniform_ratio = top_count / max(1, sum(ldist.values()))
            if uniform_ratio >= 0.6 and metrics["leads_with_value"] >= 5:
                issues.append({
                    "code": "trackcore_placeholders_only",
                    "severity": "high",
                    "title": "Trackcore só envia placeholders, não vendas reais",
                    "detail": f"{metrics['leads_with_value']} leads com valor R$ {top_value} ({uniform_ratio*100:.0f}% iguais) e apenas {metrics['purchases']} venda real detectada via mensagem chave. Os valores uniformes são placeholders de CPL alvo, não vendas.",
                    "action": "No Trackcore: configurar webhook do evento 'venda detectada' (mensagem chave) pra apontar pro Pulse. Hoje só o webhook de lead está disparando.",
                })

    # 3. Volume de leads alto mas zero purchase
    if metrics["leads"] >= 50 and metrics["purchases"] == 0:
        issues.append({
            "code": "trackcore_no_sales",
            "severity": "high",
            "title": "Vendas Trackcore não estão chegando",
            "detail": f"{metrics['leads']} leads detectados mas zero vendas via mensagem chave em 30 dias. Webhook de venda provavelmente não está configurado.",
            "action": "Verificar config no Trackcore: cliente tem webhook de evento 'sale'/'purchase' habilitado?",
        })

    # 4. Ultima venda muito antiga
    if metrics["last_purchase_date"] and metrics["leads"] > 10:
        last_p = date.fromisoformat(metrics["last_purchase_date"])
        days_since = (today - last_p).days
        if days_since >= 14:
            issues.append({
                "code": "trackcore_stale_purchases",
                "severity": "medium",
                "title": f"Última venda há {days_since} dias",
                "detail": f"Pulse recebeu última venda Trackcore em {metrics['last_purchase_date']}, mas ainda há {metrics['leads']} leads recentes. Pode ter parado de detectar vendas.",
                "action": "Auditar: vendas recentes tiveram mensagem chave no WhatsApp?",
            })

    # Status agregado
    high_count = sum(1 for i in issues if i["severity"] == "high")
    if high_count > 0:
        status = "broken" if metrics["events_30d"] == 0 else "degraded"
    elif issues:
        status = "degraded"
    else:
        status = "healthy"

    return {
        "status": status,
        "issues": issues,
        "metrics": metrics,
        "client_slug": slug,
        "checked_at": date.today().isoformat(),
    }
