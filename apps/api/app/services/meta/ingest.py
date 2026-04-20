"""
Serviço de ingestão Meta Ads.

- sync_structure(...)  → campanhas + conjuntos + anúncios + criativos (UPSERT)
- sync_insights(...)   → métricas diárias por nível (UPSERT por chave composta)
- sync_account_meta(.) → atualiza timezone/currency da conexão

Todos retornam contadores para o SyncJob.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.connection import AccountConnection, Platform
from app.models.meta import (
    MetaCampaign, MetaAdset, MetaAd, MetaCreative, MetaInsightsDaily,
)
from app.models.ops import SyncJob
from app.services.meta.client import MetaClient


# ─── helpers ─────────────────────────────────────────────────────────────
def _cents_to_decimal(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v)) / Decimal(100)
    except Exception:
        return None


def _num(v: Any, default: int | float = 0) -> Any:
    if v is None or v == "":
        return default
    try:
        return type(default)(v)  # type: ignore[call-arg]
    except Exception:
        return default


def _decimal(v: Any) -> Decimal:
    try:
        return Decimal(str(v))
    except Exception:
        return Decimal(0)


def _actions_to_dict(actions: list[dict] | None) -> dict[str, float] | None:
    if not actions:
        return None
    out: dict[str, float] = {}
    for a in actions:
        try:
            out[a["action_type"]] = float(a["value"])
        except Exception:
            continue
    return out or None


def _video_p(rows: list[dict] | None) -> int:
    if not rows:
        return 0
    total = 0
    for r in rows:
        try:
            total += int(float(r.get("value", 0)))
        except Exception:
            pass
    return total


# ─── account metadata ───────────────────────────────────────────────────
def sync_account_meta(db: Session, connection: AccountConnection, token: str) -> dict:
    with MetaClient(token) as client:
        acc = client.get_account(connection.external_account_id)
    connection.timezone_name = acc.get("timezone_name")
    connection.currency = acc.get("currency")
    connection.last_error = None
    db.add(connection)
    db.commit()
    return acc


# ─── structure ──────────────────────────────────────────────────────────
def sync_structure(db: Session, *, client_id: int, account_id: str, token: str) -> dict[str, int]:
    counts = {"campaigns": 0, "adsets": 0, "ads": 0, "creatives": 0}
    with MetaClient(token) as client:
        # campaigns
        for c in client.fetch_campaigns(account_id):
            stmt = pg_insert(MetaCampaign).values(
                id=c["id"],
                client_id=client_id,
                account_id=account_id.replace("act_", ""),
                name=c.get("name") or "",
                objective=c.get("objective"),
                status=c.get("status"),
                effective_status=c.get("effective_status"),
                bid_strategy=c.get("bid_strategy"),
                daily_budget=_cents_to_decimal(c.get("daily_budget")),
                lifetime_budget=_cents_to_decimal(c.get("lifetime_budget")),
                raw=c,
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": c.get("name") or "",
                    "objective": c.get("objective"),
                    "status": c.get("status"),
                    "effective_status": c.get("effective_status"),
                    "bid_strategy": c.get("bid_strategy"),
                    "daily_budget": _cents_to_decimal(c.get("daily_budget")),
                    "lifetime_budget": _cents_to_decimal(c.get("lifetime_budget")),
                    "raw": c,
                },
            )
            db.execute(stmt)
            counts["campaigns"] += 1

        # creatives (antes dos ads, pra FK funcionar)
        for cr in client.fetch_creatives(account_id):
            stmt = pg_insert(MetaCreative).values(
                id=cr["id"],
                client_id=client_id,
                name=cr.get("name"),
                thumb_url=cr.get("thumbnail_url"),
                image_url=cr.get("image_url"),
                video_id=cr.get("video_id"),
                creative_type=cr.get("object_type"),
                body=cr.get("body"),
                title=cr.get("title"),
                cta=cr.get("call_to_action_type"),
                link_url=cr.get("link_url"),
                raw=cr,
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": cr.get("name"),
                    "thumb_url": cr.get("thumbnail_url"),
                    "image_url": cr.get("image_url"),
                    "video_id": cr.get("video_id"),
                    "creative_type": cr.get("object_type"),
                    "body": cr.get("body"),
                    "title": cr.get("title"),
                    "cta": cr.get("call_to_action_type"),
                    "link_url": cr.get("link_url"),
                    "raw": cr,
                },
            )
            db.execute(stmt)
            counts["creatives"] += 1

        # adsets
        for a in client.fetch_adsets(account_id):
            stmt = pg_insert(MetaAdset).values(
                id=a["id"],
                client_id=client_id,
                campaign_id=a["campaign_id"],
                name=a.get("name") or "",
                status=a.get("status"),
                optimization_goal=a.get("optimization_goal"),
                billing_event=a.get("billing_event"),
                daily_budget=_cents_to_decimal(a.get("daily_budget")),
                targeting=a.get("targeting"),
                raw=a,
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": a.get("name") or "",
                    "status": a.get("status"),
                    "optimization_goal": a.get("optimization_goal"),
                    "billing_event": a.get("billing_event"),
                    "daily_budget": _cents_to_decimal(a.get("daily_budget")),
                    "targeting": a.get("targeting"),
                    "raw": a,
                },
            )
            db.execute(stmt)
            counts["adsets"] += 1

        # ads
        for ad in client.fetch_ads(account_id):
            creative_id = None
            if isinstance(ad.get("creative"), dict):
                creative_id = ad["creative"].get("id")
            stmt = pg_insert(MetaAd).values(
                id=ad["id"],
                client_id=client_id,
                adset_id=ad["adset_id"],
                creative_id=creative_id,
                name=ad.get("name") or "",
                status=ad.get("status"),
                raw=ad,
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "adset_id": ad["adset_id"],
                    "creative_id": creative_id,
                    "name": ad.get("name") or "",
                    "status": ad.get("status"),
                    "raw": ad,
                },
            )
            db.execute(stmt)
            counts["ads"] += 1

    db.commit()
    return counts


# ─── insights ───────────────────────────────────────────────────────────
def _row_to_insight_values(
    row: dict, *, client_id: int, level: str,
    breakdown_key: str, breakdown_value: str | None,
) -> dict:
    # Identifica o object_id pelo nível
    obj_id = {
        "account":  row.get("account_id"),
        "campaign": row.get("campaign_id"),
        "adset":    row.get("adset_id"),
        "ad":       row.get("ad_id"),
    }.get(level) or row.get(f"{level}_id") or row.get("account_id")

    actions = _actions_to_dict(row.get("actions"))
    action_values = _actions_to_dict(row.get("action_values"))

    purchase_roas = None
    if isinstance(row.get("purchase_roas"), list) and row["purchase_roas"]:
        try:
            purchase_roas = Decimal(str(row["purchase_roas"][0].get("value")))
        except Exception:
            purchase_roas = None

    return {
        "client_id": client_id,
        "date": date.fromisoformat(row["date_start"]),
        "level": level,
        "object_id": str(obj_id),
        "breakdown_key": breakdown_key,
        "breakdown_value": breakdown_value,
        "spend":           _decimal(row.get("spend", 0)),
        "impressions":     _num(row.get("impressions"), 0),
        "reach":           _num(row.get("reach"), 0),
        "frequency":       _decimal(row.get("frequency", 0)),
        "clicks":          _num(row.get("clicks"), 0),
        "unique_clicks":   _num(row.get("unique_clicks"), 0),
        "inline_link_clicks": _num(row.get("inline_link_clicks"), 0),
        "ctr":             _decimal(row.get("ctr", 0)),
        "cpc":             _decimal(row.get("cpc", 0)),
        "cpm":             _decimal(row.get("cpm", 0)),
        "video_p25":       _video_p(row.get("video_p25_watched_actions")),
        "video_p50":       _video_p(row.get("video_p50_watched_actions")),
        "video_p75":       _video_p(row.get("video_p75_watched_actions")),
        "video_p100":      _video_p(row.get("video_p100_watched_actions")),
        "thruplays":       _video_p(row.get("video_thruplay_watched_actions")),
        "actions":         actions,
        "action_values":   action_values,
        "purchase_roas":   purchase_roas,
    }


def sync_insights(
    db: Session, *,
    client_id: int, account_id: str, token: str,
    level: str, since: date, until: date,
    breakdown: str | None = None,
    progress: Callable[[int], None] | None = None,
) -> int:
    """Retorna número de linhas upsertadas."""
    breakdown_key = breakdown or "none"
    rows_written = 0
    with MetaClient(token) as client:
        for row in client.fetch_insights(
            account_id,
            level=level,
            since=since,
            until=until,
            breakdowns=[breakdown] if breakdown else None,
        ):
            breakdown_value = row.get(breakdown) if breakdown else None
            values = _row_to_insight_values(
                row, client_id=client_id, level=level,
                breakdown_key=breakdown_key, breakdown_value=breakdown_value,
            )
            stmt = pg_insert(MetaInsightsDaily).values(**values).on_conflict_do_update(
                constraint="uq_meta_insights_key",
                set_={k: v for k, v in values.items()
                      if k not in ("client_id", "date", "level", "object_id",
                                   "breakdown_key", "breakdown_value")},
            )
            db.execute(stmt)
            rows_written += 1
            if progress and rows_written % 100 == 0:
                progress(rows_written)
    db.commit()
    return rows_written


# ─── orquestração com SyncJob ───────────────────────────────────────────
def run_backfill(
    db: Session, *,
    connection: AccountConnection, token: str,
    days: int = 30, level: str = "ad",
) -> SyncJob:
    """Backfill completo: estrutura + insights dos últimos N dias."""
    until = date.today()
    since = until - timedelta(days=days)
    job = SyncJob(
        client_id=connection.client_id,
        platform="meta",
        kind="backfill",
        status="running",
        started_at=datetime.now(timezone.utc),
        window_start=since,
        window_end=until,
    )
    db.add(job); db.commit(); db.refresh(job)

    try:
        # 1) metadata da conta
        sync_account_meta(db, connection, token)
        # 2) estrutura
        structure_counts = sync_structure(
            db, client_id=connection.client_id,
            account_id=connection.external_account_id, token=token,
        )
        # 3) insights
        rows = sync_insights(
            db, client_id=connection.client_id,
            account_id=connection.external_account_id, token=token,
            level=level, since=since, until=until,
        )
        job.rows_written = rows + sum(structure_counts.values())
        job.status = "done"
        job.finished_at = datetime.now(timezone.utc)
        connection.last_sync_at = job.finished_at
        db.add(connection)
    except Exception as e:
        job.status = "error"
        job.error_message = str(e)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        connection.last_error = str(e)[:1000]
        db.add(connection)
        db.commit()
        raise
    finally:
        db.add(job); db.commit()
    return job
