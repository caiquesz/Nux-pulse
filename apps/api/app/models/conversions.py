"""Conversoes registradas manualmente (vendas offline, WhatsApp nao-CAPI, etc).

Entram no overview/report somando com o que vem do Meta via CAPI/pixel.
Mantidas em tabela separada pra nao misturar com insights do Meta — e pra
auditoria clara (quem registrou, quando, observacao).
"""
from datetime import date as _date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ManualConversion(Base, TimestampMixin):
    __tablename__ = "manual_conversions"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True, nullable=False
    )
    date: Mapped[_date] = mapped_column(Date, nullable=False, index=True)
    # purchase | lead | message
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    revenue: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Referencia opcional a uma campanha Meta (ex: "120226...") pra atribuir
    # a venda a uma campanha especifica. Se vazio, conta pra conta inteira.
    campaign_id: Mapped[str | None] = mapped_column(String(64))
    campaign_name: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("team_members.id", ondelete="SET NULL"))

    client = relationship("Client")
    created_by = relationship("TeamMember", foreign_keys=[created_by_id])
