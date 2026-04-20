"""
Cliente Meta Marketing API via httpx direto.

Motivo de não usar o SDK `facebook-business`:
- Menos mágica, mais controle de retry/rate-limit.
- Mais fácil de debugar e testar (respostas são dict).
- SDK é opcional para features avançadas no futuro.
"""
from __future__ import annotations

import json
import time
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx

from app.core.config import settings

GRAPH_BASE = "https://graph.facebook.com/v22.0"

# Códigos de erro da Graph API que são transient/rate-limit.
# Meta devolve 400 com esses codes — não 429 — então precisamos interceptar por code.
# Ref: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
RATE_LIMIT_CODES: set[int] = {
    4,      # user-level throttle
    17,     # user request limit reached
    32,     # page-level throttle
    613,    # custom-level throttle
    80000,  # ads management — generic rate limit
    80001,  # ads insights
    80002,  # custom audience
    80003,  # ad account delivery chaos
    80004,  # ads management — ad account
    80014,  # ads insights
}

# Throttle preventivo mínimo entre requests. Evita picos.
THROTTLE_SECONDS = 0.25

# Campos padrão por nível — mantidos conservadores para caber no limite do Graph
CAMPAIGN_FIELDS = ",".join([
    "id", "name", "account_id", "objective", "status", "effective_status",
    "bid_strategy", "daily_budget", "lifetime_budget", "budget_remaining",
    "start_time", "stop_time", "created_time", "updated_time",
])

ADSET_FIELDS = ",".join([
    "id", "name", "campaign_id", "status", "effective_status",
    "optimization_goal", "billing_event", "bid_strategy",
    "daily_budget", "lifetime_budget", "targeting",
    "start_time", "end_time", "created_time", "updated_time",
])

AD_FIELDS = ",".join([
    "id", "name", "adset_id", "campaign_id", "creative",
    "status", "effective_status", "created_time", "updated_time",
])

CREATIVE_FIELDS = ",".join([
    "id", "name", "thumbnail_url", "image_url", "video_id",
    "object_type", "body", "title", "call_to_action_type",
    "link_url", "effective_object_story_id",
])

INSIGHTS_FIELDS = ",".join([
    "date_start", "date_stop", "account_id", "campaign_id", "adset_id", "ad_id",
    "spend", "impressions", "reach", "frequency",
    "clicks", "unique_clicks", "inline_link_clicks",
    "ctr", "unique_ctr", "cpc", "cpm", "cpp",
    "actions", "action_values", "purchase_roas", "website_purchase_roas",
    "video_p25_watched_actions", "video_p50_watched_actions",
    "video_p75_watched_actions", "video_p100_watched_actions",
    "video_thruplay_watched_actions",
])


class MetaApiError(RuntimeError):
    def __init__(self, status: int, payload: dict):
        self.status = status
        self.payload = payload
        err = payload.get("error", {})
        super().__init__(f"[{status}] {err.get('type')}: {err.get('message')}  (code={err.get('code')})")


class MetaClient:
    """Thin wrapper over Meta Graph API. Safe to reuse within a request/job."""

    def __init__(self, access_token: str | None = None, timeout: float = 60.0):
        token = access_token or settings.META_SYSTEM_USER_TOKEN
        if not token:
            raise RuntimeError("META_SYSTEM_USER_TOKEN not configured")
        self._token = token
        self._http = httpx.Client(timeout=timeout, headers={"Accept": "application/json"})

    # ─── low-level ───────────────────────────────────────────────────────
    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "MetaClient":
        return self

    def __exit__(self, *a) -> None:
        self.close()

    def _parse_bucu(self, header_value: str | None) -> int:
        """Extrai o tempo sugerido (minutos) do X-Business-Use-Case-Usage.
        Retorna 0 se não conseguir parsear ou não houver sugestão."""
        if not header_value:
            return 0
        try:
            data = json.loads(header_value)
            # data = {"<bus_id>": [{"type":"...", "estimated_time_to_regain_access": N, ...}, ...]}
            mins = 0
            for entries in data.values():
                for e in entries:
                    mins = max(mins, int(e.get("estimated_time_to_regain_access", 0) or 0))
            return mins
        except Exception:
            return 0

    def _get(self, url: str, params: dict | None = None, *, retries: int = 5) -> dict:
        merged = {**(params or {}), "access_token": self._token}
        last_err: Exception | None = None
        for attempt in range(retries + 1):
            # throttle preventivo pra não martelar a API
            if attempt == 0:
                time.sleep(THROTTLE_SECONDS)
            try:
                r = self._http.get(url, params=merged)
            except httpx.RequestError as e:
                last_err = e
                time.sleep(min(60, 2 ** attempt))
                continue

            if r.status_code == 200:
                return r.json()

            # tenta parsear payload
            try:
                payload = r.json()
            except Exception:
                payload = {"error": {"message": r.text}}

            err_code = int((payload.get("error") or {}).get("code", 0) or 0)
            is_rate_limit = (
                r.status_code in (429, 500, 502, 503, 504)
                or err_code in RATE_LIMIT_CODES
            )

            if is_rate_limit and attempt < retries:
                # respeita X-Business-Use-Case-Usage se o header trouxer sugestão
                suggested_min = self._parse_bucu(r.headers.get("X-Business-Use-Case-Usage"))
                if suggested_min > 0:
                    sleep_for = min(suggested_min * 60, 15 * 60)  # cap 15 min
                else:
                    # backoff exponencial: 5s, 15s, 45s, 135s, 300s
                    sleep_for = min(300, 5 * (3 ** attempt))
                time.sleep(sleep_for)
                continue

            raise MetaApiError(r.status_code, payload)
        raise last_err or RuntimeError(f"exhausted retries for {url}")

    def _paginate(self, url: str, params: dict | None = None) -> Iterator[dict]:
        page_url: str | None = url
        page_params = params
        while page_url:
            data = self._get(page_url, page_params)
            for item in data.get("data", []):
                yield item
            paging = data.get("paging", {})
            page_url = paging.get("next")
            page_params = None  # next URL already carries all params

    # ─── high-level ──────────────────────────────────────────────────────
    def get_account(self, account_id: str) -> dict:
        """account_id no formato 'act_XXXXXX'."""
        return self._get(f"{GRAPH_BASE}/{account_id}", params={
            "fields": "id,account_id,name,account_status,currency,timezone_name,business,business_name,amount_spent,balance",
        })

    def fetch_campaigns(self, account_id: str) -> Iterator[dict]:
        yield from self._paginate(f"{GRAPH_BASE}/{account_id}/campaigns",
                                  {"fields": CAMPAIGN_FIELDS, "limit": 100})

    def fetch_adsets(self, account_id: str) -> Iterator[dict]:
        yield from self._paginate(f"{GRAPH_BASE}/{account_id}/adsets",
                                  {"fields": ADSET_FIELDS, "limit": 100})

    def fetch_ads(self, account_id: str) -> Iterator[dict]:
        yield from self._paginate(f"{GRAPH_BASE}/{account_id}/ads",
                                  {"fields": AD_FIELDS, "limit": 100})

    def fetch_creatives(self, account_id: str) -> Iterator[dict]:
        yield from self._paginate(f"{GRAPH_BASE}/{account_id}/adcreatives",
                                  {"fields": CREATIVE_FIELDS, "limit": 100})

    def fetch_insights(
        self,
        account_id: str,
        *,
        level: str,                       # account | campaign | adset | ad
        since: date,
        until: date,
        breakdowns: list[str] | None = None,
        action_attribution_windows: list[str] | None = None,
    ) -> Iterator[dict]:
        params: dict[str, Any] = {
            "level": level,
            "time_range": json.dumps({"since": since.isoformat(), "until": until.isoformat()}),
            "time_increment": 1,
            "fields": INSIGHTS_FIELDS,
            "limit": 100,
        }
        if breakdowns:
            params["breakdowns"] = ",".join(breakdowns)
        if action_attribution_windows:
            params["action_attribution_windows"] = json.dumps(action_attribution_windows)
        yield from self._paginate(f"{GRAPH_BASE}/{account_id}/insights", params)
