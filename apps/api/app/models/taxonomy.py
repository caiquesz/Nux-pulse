"""
Taxonomia de campanhas — regras regex que classificam campanhas automaticamente
em funil (TOFU/MOFU/BOFU), produto, persona, etc.
"""
from sqlalchemy import String, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TagRule(Base, TimestampMixin):
    __tablename__ = "campaign_tag_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))        # funnel|product|persona|objective|custom
    value: Mapped[str] = mapped_column(String(64))       # TOFU|MOFU|BOFU|...
    regex: Mapped[str] = mapped_column(String(512))
    priority: Mapped[int] = mapped_column(Integer, default=100)  # menor = maior precedência
    color: Mapped[str | None] = mapped_column(String(16))

    __table_args__ = (UniqueConstraint("client_id", "kind", "value", "regex", name="uq_tag_rule_key"),)


class CampaignTagMatch(Base):
    """Resultado da aplicação das regras — desnormalizado pra queries rápidas."""
    __tablename__ = "campaign_tag_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(16))
    campaign_id: Mapped[str] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    value: Mapped[str] = mapped_column(String(64))

    __table_args__ = (UniqueConstraint("client_id", "platform", "campaign_id", "kind", name="uq_ctm_key"),)
