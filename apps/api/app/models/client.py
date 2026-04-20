from decimal import Decimal
from sqlalchemy import String, Numeric, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Client(Base, TimestampMixin):
    """Empresa atendida pela agência (tenant lógico)."""
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    logo_url: Mapped[str | None] = mapped_column(String(512))
    accent_color: Mapped[str | None] = mapped_column(String(16))
    monthly_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    monthly_revenue_goal: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    connections = relationship("AccountConnection", back_populates="client", cascade="all, delete-orphan")
