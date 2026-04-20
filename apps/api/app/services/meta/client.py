"""
Cliente Meta Marketing API via httpx direto.

Motivo de não usar o SDK `facebook-business`:
- Menos mágica, mais controle de retry/rate-limit.
- Mais fácil de debugar e testar (respostas são dict).
- SDK é opcional para features avançadas no futuro.
"""
from __future__ import annotations

import json
import logging
import sys
import time
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx

from app.core.config import settings

# Logger que escreve em stdout (Railway captura stdout) com flush imediato.
_log = logging.getLogger("meta.client")
if not _log.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("%(asctime)s [meta] %(message)s"))
    _log.addHandler(h)
_log.setLevel(logging.INFO)

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


def _extract_after_cursor(url: str) -> str | None:
    """Extrai o parâmetro &after= da URL de paginação. Usado pra detectar loop."""
    import urllib.parse as _urlp
    try:
        qs = _urlp.parse_qs(_urlp.urlsplit(url).query)
        v = qs.get("after", [None])[0]
        return v
    except Exception:
        return None


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

    def _get(self, url: str, params: dict | None = None, *, retries: int = 2) -> dict:
        # Log da URL simplificada pra leitura SEM o token.
        # Meta devolve URLs de paginação com token embutido na query — precisa redact.
        short = url
        if "graph.facebook.com" in short:
            # remove o versionamento e a query completa, mantém só o path
            path = short.split("graph.facebook.com/")[-1]
            short = "/".join(path.split("?")[0].split("/")[1:]) or path.split("?")[0]
        merged = {**(params or {}), "access_token": self._token}
        last_err: Exception | None = None
        for attempt in range(retries + 1):
            if attempt == 0:
                time.sleep(THROTTLE_SECONDS)
            t0 = time.time()
            try:
                r = self._http.get(url, params=merged)
            except httpx.RequestError as e:
                last_err = e
                _log.info(f"ERR {short} (network: {e!r}) — retry {attempt+1}/{retries}")
                time.sleep(min(30, 2 ** attempt))
                continue

            dur = round(time.time() - t0, 2)
            if r.status_code == 200:
                data = r.json()
                n = len(data.get("data", [])) if isinstance(data, dict) and "data" in data else 1
                _log.info(f"OK  {short} [{dur}s, {n} rows]")
                return data

            try:
                payload = r.json()
            except Exception:
                payload = {"error": {"message": r.text}}

            err_code = int((payload.get("error") or {}).get("code", 0) or 0)
            err_msg = (payload.get("error") or {}).get("message", "")[:200]
            is_rate_limit = (
                r.status_code in (429, 500, 502, 503, 504)
                or err_code in RATE_LIMIT_CODES
            )
            _log.info(f"ERR {short} [{dur}s, http={r.status_code}, code={err_code}] {err_msg}")

            if is_rate_limit and attempt < retries:
                suggested_min = self._parse_bucu(r.headers.get("X-Business-Use-Case-Usage"))
                # Cap bem mais baixo pra não travar por horas em backoff
                sleep_for = min(suggested_min * 60, 30) if suggested_min > 0 else min(30, 5 * (2 ** attempt))
                _log.info(f"    retrying in {sleep_for}s (attempt {attempt+1}/{retries})")
                time.sleep(sleep_for)
                continue

            raise MetaApiError(r.status_code, payload)
        raise last_err or RuntimeError(f"exhausted retries for {url}")

    def _paginate(self, url: str, params: dict | None = None) -> Iterator[dict]:
        """Pagina via `paging.next`. Defesa contra o bug do Meta que devolve o MESMO
        cursor `after` indefinidamente (loop infinito) — se o cursor repete, para.
        Também para se a página chega vazia ou se excedeu um limite defensivo."""
        page_url: str | None = url
        page_params = params
        seen_cursors: set[str] = set()
        page_count = 0
        MAX_PAGES = 200  # guard: 200 pages * 100 rows = 20k entities. Ajuste se precisar.

        while page_url:
            page_count += 1
            if page_count > MAX_PAGES:
                _log.info(f"pagination: MAX_PAGES ({MAX_PAGES}) atingido, parando")
                break

            data = self._get(page_url, page_params)
            rows = data.get("data", [])
            if not rows:
                break
            for item in rows:
                yield item

            paging = data.get("paging", {})
            next_url = paging.get("next")
            if not next_url:
                break

            # detecta cursor repetido (bug do Graph API)
            cursor = _extract_after_cursor(next_url)
            if cursor and cursor in seen_cursors:
                _log.info(f"pagination: cursor '{cursor[:20]}…' repetido, parando (Graph API bug)")
                break
            if cursor:
                seen_cursors.add(cursor)

            page_url = next_url
            page_params = None

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
