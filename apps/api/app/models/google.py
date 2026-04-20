from datetime import date
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Date, Numeric, BigInteger, Integer, UniqueConstraint, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class GoogleCampaign(Base, TimestampMixin):
    __tablename__ = "google_campaigns"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(255))
    channel_type: Mapped[str | None] = mapped_column(String(32))  # SEARCH|DISPLAY|SHOPPING|VIDEO|PERFORMANCE_MAX|DEMAND_GEN
    status: Mapped[str | None] = mapped_column(String(32))
    bidding_strategy_type: Mapped[str | None] = mapped_column(String(64))
    budget_amount_micros: Mapped[int | None] = mapped_column(BigInteger)
    raw: Mapped[dict | None] = mapped_column(JSONB)


class GoogleAdGroup(Base, TimestampMixin):
    __tablename__ = "google_ad_groups"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("google_campaigns.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(32))
    type: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict | None] = mapped_column(JSONB)


class GoogleAd(Base, TimestampMixin):
    __tablename__ = "google_ads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    ad_group_id: Mapped[str] = mapped_column(ForeignKey("google_ad_groups.id", ondelete="CASCADE"), index=True)
    ad_type: Mapped[str | None] = mapped_column(String(32))  # RSA|ETA|PMAX_ASSET|...
    final_urls: Mapped[list | None] = mapped_column(JSONB)
    headlines: Mapped[list | None] = mapped_column(JSONB)
    descriptions: Mapped[list | None] = mapped_column(JSONB)
    status: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict | None] = mapped_column(JSONB)


class GoogleKeyword(Base, TimestampMixin):
    __tablename__ = "google_keywords"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    ad_group_id: Mapped[str] = mapped_column(ForeignKey("google_ad_groups.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(512))
    match_type: Mapped[str | None] = mapped_column(String(16))
    status: Mapped[str | None] = mapped_column(String(32))
    quality_score: Mapped[int | None] = mapped_column(Integer)
    raw: Mapped[dict | None] = mapped_column(JSONB)


class GoogleAssetGroup(Base, TimestampMixin):
    """PMax asset groups."""
    __tablename__ = "google_asset_groups"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("google_campaigns.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict | None] = mapped_column(JSONB)


class GoogleSearchTermDaily(Base):
    """Termo de busca (user search) por dia."""
    __tablename__ = "google_search_terms_daily"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    campaign_id: Mapped[str] = mapped_column(String(32), index=True)
    ad_group_id: Mapped[str] = mapped_column(String(32), index=True)
    search_term: Mapped[str] = mapped_column(String(512))
    match_type: Mapped[str | None] = mapped_column(String(16))

    impressions: Mapped[int] = mapped_column(BigInteger, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    cost_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    conversions: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    conversion_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)

    __table_args__ = (
        UniqueConstraint("client_id", "date", "campaign_id", "ad_group_id", "search_term",
                         name="uq_google_search_terms_key"),
        Index("ix_gst_client_date", "client_id", "date"),
    )


class GoogleInsightsDaily(Base):
    """Métricas diárias Google Ads por nível + segmentação."""
    __tablename__ = "google_insights_daily"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    level: Mapped[str] = mapped_column(String(16))  # customer|campaign|ad_group|ad|keyword|asset_group
    object_id: Mapped[str] = mapped_column(String(48))
    segment_key: Mapped[str] = mapped_column(String(32), default="none")   # device|network|geo|hour|none
    segment_value: Mapped[str | None] = mapped_column(String(64))

    impressions: Mapped[int] = mapped_column(BigInteger, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    cost_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    conversions: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    all_conversions: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    conversion_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    all_conversion_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    view_through_conversions: Mapped[int] = mapped_column(Integer, default=0)
    interactions: Mapped[int] = mapped_column(BigInteger, default=0)
    video_views: Mapped[int] = mapped_column(Integer, default=0)

    # Impression Share / Quality (Search)
    search_impression_share: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    search_top_is: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    search_abs_top_is: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    search_budget_lost_is: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    search_rank_lost_is: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))

    __table_args__ = (
        UniqueConstraint("client_id", "date", "level", "object_id", "segment_key", "segment_value",
                         name="uq_google_insights_key"),
        Index("ix_google_insights_client_date", "client_id", "date"),
        Index("ix_google_insights_object", "object_id"),
    )
