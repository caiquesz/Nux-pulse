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

    # ── Integracao Trackcore (e potencialmente outros sistemas externos) ──────
    # external_event_id e o id do evento no sistema de origem; usado pra
    # idempotencia (UNIQUE). Se vier de Trackcore, e o uuid do Event ou
    # Conversation. Manuais via UI deixam null.
    external_event_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    # 'manual' (UI) | 'trackcore' | outros futuros (shopify, etc)
    attribution_source: Mapped[str] = mapped_column(String(40), default="manual", server_default="manual", index=True)

    # Atribuicao por UTM (de Event do Trackcore)
    utm_source: Mapped[str | None] = mapped_column(String(120))
    utm_medium: Mapped[str | None] = mapped_column(String(120))
    utm_campaign: Mapped[str | None] = mapped_column(String(200), index=True)
    utm_content: Mapped[str | None] = mapped_column(String(200))
    utm_term: Mapped[str | None] = mapped_column(String(200))

    # Atribuicao Meta direta (de Conversation do Trackcore — click-to-WhatsApp)
    meta_ad_id: Mapped[str | None] = mapped_column(String(64), index=True)
    meta_ad_name: Mapped[str | None] = mapped_column(String(200))

    client = relationship("Client")
    created_by = relationship("TeamMember", foreign_keys=[created_by_id])
