from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.crypto import encrypt
from app.core.db import get_db
from app.models.client import Client
from app.models.connection import AccountConnection, Platform
from app.schemas.client import ClientCreate, ClientRead
from app.schemas.connection import ConnectionRead, MetaConnectionCreate

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("", response_model=list[ClientRead])
def list_clients(db: Session = Depends(get_db)):
    return db.query(Client).filter(Client.is_active.is_(True)).order_by(Client.name).all()


@router.post("", response_model=ClientRead, status_code=201)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    existing = db.query(Client).filter(Client.slug == payload.slug).first()
    if existing:
        raise HTTPException(409, f"Client with slug '{payload.slug}' already exists")
    c = Client(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("/{slug}", response_model=ClientRead)
def get_client(slug: str, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "Client not found")
    return c


@router.get("/{slug}/connections", response_model=list[ConnectionRead])
def list_connections(slug: str, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "Client not found")
    rows = db.query(AccountConnection).filter(AccountConnection.client_id == c.id).all()
    # serializa enum+datetime manualmente (schema usa str)
    return [
        ConnectionRead(
            id=r.id, client_id=r.client_id,
            platform=r.platform.value if hasattr(r.platform, "value") else str(r.platform),
            external_account_id=r.external_account_id,
            display_name=r.display_name,
            status=r.status.value if hasattr(r.status, "value") else str(r.status),
            last_sync_at=r.last_sync_at.isoformat() if r.last_sync_at else None,
            last_error=r.last_error,
        )
        for r in rows
    ]


@router.post("/{slug}/connections/meta", response_model=ConnectionRead, status_code=201)
def create_meta_connection(slug: str, payload: MetaConnectionCreate, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.slug == slug).first()
    if not c:
        raise HTTPException(404, "Client not found")

    existing = (
        db.query(AccountConnection)
        .filter(
            AccountConnection.client_id == c.id,
            AccountConnection.platform == Platform.meta,
            AccountConnection.external_account_id == payload.external_account_id,
        )
        .first()
    )
    # upsert: se já existe, re-encripta o token (uso típico: rotação)
    if existing:
        existing.tokens_enc = encrypt(payload.system_user_token)
        if payload.display_name:
            existing.display_name = payload.display_name
        db.add(existing); db.commit(); db.refresh(existing)
        conn = existing
    else:
        conn = AccountConnection(
            client_id=c.id,
            platform=Platform.meta,
            external_account_id=payload.external_account_id,
            display_name=payload.display_name,
            tokens_enc=encrypt(payload.system_user_token),
        )
        db.add(conn); db.commit(); db.refresh(conn)

    return ConnectionRead(
        id=conn.id, client_id=conn.client_id,
        platform=conn.platform.value if hasattr(conn.platform, "value") else str(conn.platform),
        external_account_id=conn.external_account_id,
        display_name=conn.display_name,
        status=conn.status.value if hasattr(conn.status, "value") else str(conn.status),
        last_sync_at=conn.last_sync_at.isoformat() if conn.last_sync_at else None,
        last_error=conn.last_error,
    )
