from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.niche import Niche
from app.schemas.niche import NicheCreate, NicheRead


router = APIRouter(prefix="/api/niches", tags=["niches"])


@router.get("", response_model=list[NicheRead])
def list_niches(db: Session = Depends(get_db)):
    return db.query(Niche).order_by(Niche.name).all()


@router.post("", response_model=NicheRead, status_code=201)
def create_niche(payload: NicheCreate, db: Session = Depends(get_db)):
    existing = db.query(Niche).filter(Niche.code == payload.code).first()
    if existing:
        raise HTTPException(409, f"niche '{payload.code}' already exists")
    n = Niche(**payload.model_dump())
    db.add(n); db.commit(); db.refresh(n)
    return n


@router.delete("/{code}", status_code=204)
def delete_niche(code: str, db: Session = Depends(get_db)):
    n = db.query(Niche).filter(Niche.code == code).first()
    if not n:
        raise HTTPException(404, "niche not found")
    db.delete(n); db.commit()
