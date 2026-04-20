"""
CLI para disparar ingestão Meta — com controle fino.

Uso:
    python -m scripts.backfill --slug segredos-de-minas --days 7 --level campaign
    python -m scripts.backfill --slug ... --only structure
    python -m scripts.backfill --slug ... --only insights --days 7 --level campaign

Flags:
    --slug    slug do cliente (obrigatório)
    --days    janela (default 30)
    --level   account | campaign | adset | ad (default ad)
    --only    full | structure | insights   (default full)
"""
import argparse
import sys
from datetime import date, datetime, timedelta, timezone

from app.core.crypto import decrypt
from app.core.db import SessionLocal
from app.models.client import Client
from app.models.connection import AccountConnection, Platform
from app.models.ops import SyncJob
from app.services.meta.ingest import (
    run_backfill, sync_account_meta, sync_structure, sync_insights,
)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--slug", required=True)
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--level", default="ad", choices=["account", "campaign", "adset", "ad"])
    p.add_argument("--only", default="full", choices=["full", "structure", "insights"])
    args = p.parse_args()

    db = SessionLocal()
    try:
        c = db.query(Client).filter(Client.slug == args.slug).first()
        if not c:
            print(f"✗ Client '{args.slug}' not found", file=sys.stderr)
            return 1
        conn = (
            db.query(AccountConnection)
            .filter(AccountConnection.client_id == c.id, AccountConnection.platform == Platform.meta)
            .first()
        )
        if not conn or not conn.tokens_enc:
            print(f"✗ No Meta connection for '{args.slug}'", file=sys.stderr)
            return 1

        token = decrypt(conn.tokens_enc)
        print(f"→ client={c.slug} account={conn.external_account_id} "
              f"only={args.only} days={args.days} level={args.level}")

        if args.only == "full":
            job = run_backfill(db, connection=conn, token=token, days=args.days, level=args.level)
            print(f"✓ Job #{job.id}: status={job.status} rows_written={job.rows_written}")
            if job.error_message:
                print(f"  error: {job.error_message}")
            return 0 if job.status == "done" else 1

        # ── modo parcial: registra job próprio pra rastrear ──
        until = date.today()
        since = until - timedelta(days=args.days)
        job = SyncJob(
            client_id=c.id, platform="meta", kind=f"partial:{args.only}", status="running",
            started_at=datetime.now(timezone.utc),
            window_start=since if args.only == "insights" else None,
            window_end=until if args.only == "insights" else None,
        )
        db.add(job); db.commit(); db.refresh(job)

        try:
            rows = 0
            if args.only == "structure":
                sync_account_meta(db, conn, token)
                counts = sync_structure(
                    db, client_id=c.id,
                    account_id=conn.external_account_id, token=token,
                )
                rows = sum(counts.values())
                print(f"  structure: {counts}")
            else:  # insights
                rows = sync_insights(
                    db, client_id=c.id,
                    account_id=conn.external_account_id, token=token,
                    level=args.level, since=since, until=until,
                )
                print(f"  insights: {rows} rows")
            job.rows_written = rows
            job.status = "done"
        except Exception as e:
            job.status = "error"
            job.error_message = str(e)[:1000]
            conn.last_error = str(e)[:1000]
            db.add(conn)
            print(f"✗ error: {e}", file=sys.stderr)
        finally:
            job.finished_at = datetime.now(timezone.utc)
            db.add(job); db.commit()

        print(f"✓ Job #{job.id}: status={job.status} rows_written={job.rows_written}")
        return 0 if job.status == "done" else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
