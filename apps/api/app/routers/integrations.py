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
    result = db.execute(stmt)
    db.commit()

    inserted = result.rowcount > 0
    return {
        "status": "ok",
        "client": client.slug,
        "event_id": payload.event_id,
        "inserted": inserted,
        "kind": mapped_kind,
    }
