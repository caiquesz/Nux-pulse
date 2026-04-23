from datetime import date
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Date, Numeric, BigInteger, Integer, UniqueConstraint, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MetaCampaign(Base, TimestampMixin):
    __tablename__ = "meta_campaigns"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # external
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(255))
    objective: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str | None] = mapped_column(String(32))
    effective_status: Mapped[str | None] = mapped_column(String(32))
    bid_strategy: Mapped[str | None] = mapped_column(String(64))
    daily_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    lifetime_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    raw: Mapped[dict | None] = mapped_column(JSONB)


class MetaAdset(Base, TimestampMixin):
    __tablename__ = "meta_adsets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("meta_campaigns.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(32))
    optimization_goal: Mapped[str | None] = mapped_column(String(64))
    billing_event: Mapped[str | None] = mapped_column(String(64))
    daily_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    targeting: Mapped[dict | None] = mapped_column(JSONB)
    raw: Mapped[dict | None] = mapped_column(JSONB)


class MetaAd(Base, TimestampMixin):
    __tablename__ = "meta_ads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    adset_id: Mapped[str] = mapped_column(ForeignKey("meta_adsets.id", ondelete="CASCADE"), index=True)
    creative_id: Mapped[str | None] = mapped_column(ForeignKey("meta_creatives.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict | None] = mapped_column(JSONB)


class MetaCreative(Base, TimestampMixin):
    __tablename__ = "meta_creatives"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    thumb_url: Mapped[str | None] = mapped_column(String(1024))
    image_url: Mapped[str | None] = mapped_column(String(1024))
    video_id: Mapped[str | None] = mapped_column(String(32))
    creative_type: Mapped[str | None] = mapped_column(String(32))  # IMAGE / VIDEO / CAROUSEL / DPA
    body: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(512))
    cta: Mapped[str | None] = mapped_column(String(64))
    link_url: Mapped[str | None] = mapped_column(String(1024))
    hash: Mapped[str | None] = mapped_column(String(64), index=True)
    raw: Mapped[dict | None] = mapped_column(JSONB)


class MetaInsightsDaily(Base):
    """Métricas diárias Meta. Chave composta: (client, date, level, object, breakdown)."""
    __tablename__ = "meta_insights_daily"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    level: Mapped[str] = mapped_column(String(16))  # account|campaign|adset|ad
    object_id: Mapped[str] = mapped_column(String(32))
    # Nomes de breakdowns da Meta podem passar de 32 chars
    # (ex.: "hourly_stats_aggregated_by_advertiser_time_zone" = 46). 64 é folgado.
    breakdown_key: Mapped[str] = mapped_column(String(64), default="none")
    breakdown_value: Mapped[str | None] = mapped_column(String(128))

    spend: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    impressions: Mapped[int] = mapped_column(BigInteger, default=0)
    reach: Mapped[int] = mapped_column(BigInteger, default=0)
    frequency: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    unique_clicks: Mapped[int] = mapped_column(Integer, default=0)
    inline_link_clicks: Mapped[int] = mapped_column(Integer, default=0)
    ctr: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=0)
    cpc: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=0)
    cpm: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=0)
    video_p25: Mapped[int] = mapped_column(Integer, default=0)
    video_p50: Mapped[int] = mapped_column(Integer, default=0)
    video_p75: Mapped[int] = mapped_column(Integer, default=0)
    video_p100: Mapped[int] = mapped_column(Integer, default=0)
    thruplays: Mapped[int] = mapped_column(Integer, default=0)

    actions: Mapped[dict | None] = mapped_column(JSONB)           # {purchase: 12, lead: 4, ...}
    action_values: Mapped[dict | None] = mapped_column(JSONB)     # {purchase: 3840.00, ...}
    purchase_roas: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))

    __table_args__ = (
        UniqueConstraint("client_id", "date", "level", "object_id", "breakdown_key", "breakdown_value",
                         name="uq_meta_insights_key"),
        Index("ix_meta_insights_client_date", "client_id", "date"),
        Index("ix_meta_insights_object", "object_id"),
    )
