from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.client import Client
from app.schemas.client import ClientCreate, ClientRead

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
