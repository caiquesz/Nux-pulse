"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── clients ───
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("logo_url", sa.String(512)),
        sa.Column("accent_color", sa.String(16)),
        sa.Column("monthly_budget", sa.Numeric(14, 2)),
        sa.Column("monthly_revenue_goal", sa.Numeric(14, 2)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_clients_slug", "clients", ["slug"])

    # ─── enums ── criados explicitamente; as colunas abaixo não devem recriar.
    platform_enum = postgresql.ENUM("meta", "google", name="platform_enum", create_type=False)
    conn_status_enum = postgresql.ENUM(
        "active", "expired", "error", "disabled", name="connection_status_enum", create_type=False
    )
    postgresql.ENUM("meta", "google", name="platform_enum").create(op.get_bind(), checkfirst=True)
    postgresql.ENUM(
        "active", "expired", "error", "disabled", name="connection_status_enum"
    ).create(op.get_bind(), checkfirst=True)

    # ─── account_connections ───
    op.create_table(
        "account_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", platform_enum, nullable=False),
        sa.Column("external_account_id", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(120)),
        sa.Column("tokens_enc", sa.LargeBinary()),
        sa.Column("status", conn_status_enum, nullable=False, server_default="active"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(1000)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ac_client", "account_connections", ["client_id"])

    # ─── meta ───
    op.create_table(
        "meta_campaigns",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("objective", sa.String(64)),
        sa.Column("status", sa.String(32)),
        sa.Column("effective_status", sa.String(32)),
        sa.Column("bid_strategy", sa.String(64)),
        sa.Column("daily_budget", sa.Numeric(14, 2)),
        sa.Column("lifetime_budget", sa.Numeric(14, 2)),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_meta_camp_client", "meta_campaigns", ["client_id"])
    op.create_index("ix_meta_camp_acc", "meta_campaigns", ["account_id"])

    op.create_table(
        "meta_creatives",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column("thumb_url", sa.String(1024)),
        sa.Column("image_url", sa.String(1024)),
        sa.Column("video_id", sa.String(32)),
        sa.Column("creative_type", sa.String(32)),
        sa.Column("body", sa.Text()),
        sa.Column("title", sa.String(512)),
        sa.Column("cta", sa.String(64)),
        sa.Column("link_url", sa.String(1024)),
        sa.Column("hash", sa.String(64)),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_meta_cre_client", "meta_creatives", ["client_id"])
    op.create_index("ix_meta_cre_hash", "meta_creatives", ["hash"])

    op.create_table(
        "meta_adsets",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", sa.String(32), sa.ForeignKey("meta_campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32)),
        sa.Column("optimization_goal", sa.String(64)),
        sa.Column("billing_event", sa.String(64)),
        sa.Column("daily_budget", sa.Numeric(14, 2)),
        sa.Column("targeting", postgresql.JSONB()),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_meta_adset_client", "meta_adsets", ["client_id"])
    op.create_index("ix_meta_adset_camp", "meta_adsets", ["campaign_id"])

    op.create_table(
        "meta_ads",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adset_id", sa.String(32), sa.ForeignKey("meta_adsets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creative_id", sa.String(32), sa.ForeignKey("meta_creatives.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32)),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_meta_ad_client", "meta_ads", ["client_id"])
    op.create_index("ix_meta_ad_adset", "meta_ads", ["adset_id"])

    op.create_table(
        "meta_insights_daily",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("level", sa.String(16), nullable=False),
        sa.Column("object_id", sa.String(32), nullable=False),
        sa.Column("breakdown_key", sa.String(32), nullable=False, server_default="none"),
        sa.Column("breakdown_value", sa.String(64)),
        sa.Column("spend", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("impressions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("reach", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("frequency", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unique_clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inline_link_clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ctr", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("cpc", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("cpm", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("video_p25", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_p50", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_p75", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_p100", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("thruplays", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actions", postgresql.JSONB()),
        sa.Column("action_values", postgresql.JSONB()),
        sa.Column("purchase_roas", sa.Numeric(10, 4)),
        sa.UniqueConstraint("client_id", "date", "level", "object_id", "breakdown_key", "breakdown_value",
                            name="uq_meta_insights_key"),
    )
    op.create_index("ix_meta_insights_client_date", "meta_insights_daily", ["client_id", "date"])
    op.create_index("ix_meta_insights_object", "meta_insights_daily", ["object_id"])

    # ─── google ───
    op.create_table(
        "google_campaigns",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("channel_type", sa.String(32)),
        sa.Column("status", sa.String(32)),
        sa.Column("bidding_strategy_type", sa.String(64)),
        sa.Column("budget_amount_micros", sa.BigInteger()),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_g_camp_client", "google_campaigns", ["client_id"])
    op.create_index("ix_g_camp_customer", "google_campaigns", ["customer_id"])

    op.create_table(
        "google_ad_groups",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", sa.String(32), sa.ForeignKey("google_campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32)),
        sa.Column("type", sa.String(32)),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_g_ag_client", "google_ad_groups", ["client_id"])
    op.create_index("ix_g_ag_camp", "google_ad_groups", ["campaign_id"])

    op.create_table(
        "google_ads",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ad_group_id", sa.String(32), sa.ForeignKey("google_ad_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ad_type", sa.String(32)),
        sa.Column("final_urls", postgresql.JSONB()),
        sa.Column("headlines", postgresql.JSONB()),
        sa.Column("descriptions", postgresql.JSONB()),
        sa.Column("status", sa.String(32)),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_g_ads_client", "google_ads", ["client_id"])
    op.create_index("ix_g_ads_ag", "google_ads", ["ad_group_id"])

    op.create_table(
        "google_keywords",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ad_group_id", sa.String(32), sa.ForeignKey("google_ad_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.String(512), nullable=False),
        sa.Column("match_type", sa.String(16)),
        sa.Column("status", sa.String(32)),
        sa.Column("quality_score", sa.Integer()),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_g_kw_client", "google_keywords", ["client_id"])
    op.create_index("ix_g_kw_ag", "google_keywords", ["ad_group_id"])

    op.create_table(
        "google_asset_groups",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", sa.String(32), sa.ForeignKey("google_campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32)),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_g_asg_client", "google_asset_groups", ["client_id"])
    op.create_index("ix_g_asg_camp", "google_asset_groups", ["campaign_id"])

    op.create_table(
        "google_search_terms_daily",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("campaign_id", sa.String(32), nullable=False),
        sa.Column("ad_group_id", sa.String(32), nullable=False),
        sa.Column("search_term", sa.String(512), nullable=False),
        sa.Column("match_type", sa.String(16)),
        sa.Column("impressions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_micros", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("conversions", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("conversion_value", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.UniqueConstraint("client_id", "date", "campaign_id", "ad_group_id", "search_term",
                            name="uq_google_search_terms_key"),
    )
    op.create_index("ix_gst_client_date", "google_search_terms_daily", ["client_id", "date"])
    op.create_index("ix_gst_camp", "google_search_terms_daily", ["campaign_id"])
    op.create_index("ix_gst_ag", "google_search_terms_daily", ["ad_group_id"])

    op.create_table(
        "google_insights_daily",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("level", sa.String(16), nullable=False),
        sa.Column("object_id", sa.String(48), nullable=False),
        sa.Column("segment_key", sa.String(32), nullable=False, server_default="none"),
        sa.Column("segment_value", sa.String(64)),
        sa.Column("impressions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_micros", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("conversions", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("all_conversions", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("conversion_value", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("all_conversion_value", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("view_through_conversions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("interactions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("video_views", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("search_impression_share", sa.Numeric(6, 4)),
        sa.Column("search_top_is", sa.Numeric(6, 4)),
        sa.Column("search_abs_top_is", sa.Numeric(6, 4)),
        sa.Column("search_budget_lost_is", sa.Numeric(6, 4)),
        sa.Column("search_rank_lost_is", sa.Numeric(6, 4)),
        sa.UniqueConstraint("client_id", "date", "level", "object_id", "segment_key", "segment_value",
                            name="uq_google_insights_key"),
    )
    op.create_index("ix_google_insights_client_date", "google_insights_daily", ["client_id", "date"])
    op.create_index("ix_google_insights_object", "google_insights_daily", ["object_id"])

    # ─── unified ───
    op.create_table(
        "unified_insights_daily",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("campaign_id", sa.String(32), nullable=False),
        sa.Column("campaign_name", sa.String(255)),
        sa.Column("spend", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("impressions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("conversions", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("conversion_value", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("ctr", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("cpc", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("cpa", sa.Numeric(10, 4)),
        sa.Column("roas", sa.Numeric(10, 4)),
        sa.UniqueConstraint("client_id", "date", "platform", "campaign_id", name="uq_unified_key"),
    )
    op.create_index("ix_unified_client_date", "unified_insights_daily", ["client_id", "date"])

    # ─── taxonomy ───
    op.create_table(
        "campaign_tag_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("value", sa.String(64), nullable=False),
        sa.Column("regex", sa.String(512), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("color", sa.String(16)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("client_id", "kind", "value", "regex", name="uq_tag_rule_key"),
    )
    op.create_index("ix_ctr_client", "campaign_tag_rules", ["client_id"])

    op.create_table(
        "campaign_tag_matches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("campaign_id", sa.String(32), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("value", sa.String(64), nullable=False),
        sa.UniqueConstraint("client_id", "platform", "campaign_id", "kind", name="uq_ctm_key"),
    )
    op.create_index("ix_ctm_client", "campaign_tag_matches", ["client_id"])
    op.create_index("ix_ctm_campaign", "campaign_tag_matches", ["campaign_id"])

    # ─── ops ───
    op.create_table(
        "sync_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("window_start", sa.Date()),
        sa.Column("window_end", sa.Date()),
        sa.Column("rows_written", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text()),
    )
    op.create_index("ix_sync_client", "sync_jobs", ["client_id"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("platform", sa.String(16)),
        sa.Column("object_id", sa.String(48)),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("dismissed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_alerts_client", "alerts", ["client_id"])


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("sync_jobs")
    op.drop_table("campaign_tag_matches")
    op.drop_table("campaign_tag_rules")
    op.drop_table("unified_insights_daily")
    op.drop_table("google_insights_daily")
    op.drop_table("google_search_terms_daily")
    op.drop_table("google_asset_groups")
    op.drop_table("google_keywords")
    op.drop_table("google_ads")
    op.drop_table("google_ad_groups")
    op.drop_table("google_campaigns")
    op.drop_table("meta_insights_daily")
    op.drop_table("meta_ads")
    op.drop_table("meta_adsets")
    op.drop_table("meta_creatives")
    op.drop_table("meta_campaigns")
    op.drop_table("account_connections")
    op.drop_table("clients")
    sa.Enum(name="connection_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="platform_enum").drop(op.get_bind(), checkfirst=True)
