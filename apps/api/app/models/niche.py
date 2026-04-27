from datetime import datetime
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Niche(Base):
    """Nicho/vertical de cliente — self-service (Caique adiciona pela UI).

    Usado como FK em `clients.niche_code` e `niche_benchmarks.niche_code`
    pra manter consistência cross-cliente nos benchmarks.
    """
    __tablename__ = "niches"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
