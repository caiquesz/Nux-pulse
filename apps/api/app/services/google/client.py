"""
Wrapper sobre google-ads-python SDK.
Fase 3: implementar fetch_campaigns, fetch_ad_groups, fetch_keywords, fetch_search_terms,
       fetch_insights via GAQL.
"""
from app.core.config import settings


class GoogleAdsClient:
    def __init__(self, customer_id: str | None = None):
        self.customer_id = customer_id
        self.developer_token = settings.GOOGLE_ADS_DEVELOPER_TOKEN
        if not self.developer_token:
            raise RuntimeError("GOOGLE_ADS_DEVELOPER_TOKEN not configured")

    def query(self, gaql: str):
        raise NotImplementedError("Phase 3")
