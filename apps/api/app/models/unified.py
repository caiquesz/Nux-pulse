"""
Tabela unificada cross-plataforma. Populada por rotina ETL após ingestão Meta/Google.
Usada por dashboards de Visão Geral e comparativos blended.
"""
from datetime import date
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Date, Numeric, BigInteger, Integer, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UnifiedInsightsDaily(Base):
    __tablename__ = "unified_insights_daily"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    platform: Mapped[str] = mapped_column(String(16))  # meta|google
    campaign_id: Mapped[str] = mapped_column(String(32))
    campaign_name: Mapped[str | None] = mapped_column(String(255))

    spend: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    impressions: Mapped[int] = mapped_column(BigInteger, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    conversions: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    conversion_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    ctr: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=0)
    cpc: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=0)
    cpa: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    roas: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))

    __table_args__ = (
        UniqueConstraint("client_id", "date", "platform", "campaign_id", name="uq_unified_key"),
        Index("ix_unified_client_date", "client_id", "date"),
    )
