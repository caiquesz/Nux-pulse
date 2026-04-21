// Cliente HTTP para a API NUX Pulse — todas as chamadas tipadas.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ClientRead = {
  id: number;
  slug: string;
  name: string;
  logo_url: string | null;
  accent_color: string | null;
  monthly_budget: string | null;
  monthly_revenue_goal: string | null;
  is_active: boolean;
};

export type MetaOverview = {
  client: string;
  platform: "meta";
  period_days: number;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  // Conversões
  messages: number;
  leads: number;
  purchases: number;
  revenue: number;
  roas: number;
  cost_per_message: number;
  cost_per_lead: number;
  cost_per_purchase: number;
};

export type MetaCampaignRow = {
  id: string;
  name: string;
  effective_status: string | null;
  objective: string | null;
  daily_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
};

export type MetaCampaignsResponse = {
  client: string;
  period_days: number;
  campaigns: MetaCampaignRow[];
};

export type MetaDailyPoint = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  messages: number;
  leads: number;
  purchases: number;
  revenue: number;
};

export type MetaDailyResponse = {
  client: string;
  period_days: number;
  series: MetaDailyPoint[];
};

export type SyncJobRead = {
  id: number;
  client_id: number;
  platform: string;
  kind: string;
  status: "pending" | "running" | "done" | "error";
  started_at: string | null;
  finished_at: string | null;
  window_start: string | null;
  window_end: string | null;
  rows_written: number;
  error_message: string | null;
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} ${path} — ${text.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} ${path} — ${text.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

// ─── clients ─────────────────────────────────────────────────────────────
export const listClients = () => get<ClientRead[]>("/api/clients");
export const getClient = (slug: string) => get<ClientRead>(`/api/clients/${slug}`);

export type ClientCreatePayload = {
  slug: string;
  name: string;
  accent_color?: string | null;
  monthly_budget?: number | null;
  monthly_revenue_goal?: number | null;
  logo_url?: string | null;
};
export const createClient = (body: ClientCreatePayload) =>
  post<ClientRead>("/api/clients", body);

// ─── connections ─────────────────────────────────────────────────────────
export type ConnectionRead = {
  id: number;
  client_id: number;
  platform: "meta" | "google" | string;
  external_account_id: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
};

export const listConnections = (slug: string) =>
  get<ConnectionRead[]>(`/api/clients/${slug}/connections`);

export type MetaConnectionPayload = {
  external_account_id: string;
  display_name?: string | null;
  system_user_token: string;
};
export const createMetaConnection = (slug: string, body: MetaConnectionPayload) =>
  post<ConnectionRead>(`/api/clients/${slug}/connections/meta`, body);

export type GoogleConnectionPayload = {
  customer_id: string;
  display_name?: string | null;
  developer_token: string;
  oauth_client_id: string;
  oauth_client_secret: string;
  refresh_token: string;
  login_customer_id?: string | null;
};
export const createGoogleConnection = (slug: string, body: GoogleConnectionPayload) =>
  post<ConnectionRead>(`/api/clients/${slug}/connections/google`, body);

// ─── meta insights ───────────────────────────────────────────────────────
export type RangeOpts = { days?: number; since?: string; until?: string };

function rangeQuery(o: RangeOpts): string {
  const q = new URLSearchParams();
  if (o.since && o.until) {
    q.set("since", o.since);
    q.set("until", o.until);
  } else {
    q.set("days", String(o.days ?? 30));
  }
  return q.toString();
}

export const metaOverview = (slug: string, opts: RangeOpts = {}) =>
  get<MetaOverview>(`/api/clients/${slug}/meta/overview?${rangeQuery(opts)}`);

export const metaCampaigns = (slug: string, opts: RangeOpts = {}) =>
  get<MetaCampaignsResponse>(`/api/clients/${slug}/meta/campaigns?${rangeQuery(opts)}`);

export const metaDaily = (slug: string, opts: RangeOpts = {}) =>
  get<MetaDailyResponse>(`/api/clients/${slug}/meta/insights/daily?${rangeQuery(opts)}`);

// Adsets / Ads / Creatives / Funnel
export type MetaAdsetRow = {
  id: string; name: string; campaign_id: string; campaign_name: string;
  status: string | null; optimization_goal: string | null; daily_budget: number;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
};
export const metaAdsets = (slug: string, opts: RangeOpts & { campaign_id?: string } = {}) => {
  const q = new URLSearchParams(rangeQuery(opts));
  if (opts.campaign_id) q.set("campaign_id", opts.campaign_id);
  return get<{ adsets: MetaAdsetRow[]; period_days: number }>(
    `/api/clients/${slug}/meta/adsets?${q.toString()}`
  );
};

export type MetaAdRow = {
  id: string; name: string; adset_id: string; campaign_id: string;
  status: string | null; creative_id: string | null;
  thumb_url: string | null; creative_type: string | null; creative_title: string | null;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
};
export const metaAds = (slug: string, opts: RangeOpts & { campaign_id?: string; adset_id?: string; limit?: number } = {}) => {
  const q = new URLSearchParams(rangeQuery(opts));
  if (opts.campaign_id) q.set("campaign_id", opts.campaign_id);
  if (opts.adset_id) q.set("adset_id", opts.adset_id);
  if (opts.limit) q.set("limit", String(opts.limit));
  return get<{ ads: MetaAdRow[]; period_days: number }>(
    `/api/clients/${slug}/meta/ads?${q.toString()}`
  );
};

export type MetaCreativeRow = {
  id: string; name: string | null; thumb_url: string | null;
  creative_type: string | null; title: string | null; body: string | null;
  ads_using: number;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
};
export const metaCreatives = (slug: string, opts: RangeOpts & { limit?: number } = {}) => {
  const q = new URLSearchParams(rangeQuery(opts));
  if (opts.limit) q.set("limit", String(opts.limit));
  return get<{ creatives: MetaCreativeRow[]; period_days: number }>(
    `/api/clients/${slug}/meta/creatives?${q.toString()}`
  );
};

export type FunnelStage = { key: string; label: string; value: number; conversion_from_prev: number | null };
export type MetaFunnelResponse = {
  client: string; period_days: number;
  stages: FunnelStage[];
  other_actions: Record<string, number>;
};
export const metaFunnel = (slug: string, opts: RangeOpts = {}) =>
  get<MetaFunnelResponse>(`/api/clients/${slug}/meta/funnel?${rangeQuery(opts)}`);

// Pacing
export type PacingCampaign = {
  campaign_id: string; campaign_name: string; effective_status: string | null;
  daily_budget: number; expected_spend: number; actual_spend: number;
  percent_of_expected: number; status: "underpace" | "on_pace" | "overpace";
};
export type PacingResponse = {
  client: string; period_days: number;
  campaigns: PacingCampaign[];
  totals: { expected_spend: number; actual_spend: number; percent_of_expected: number };
};
export const metaPacing = (slug: string, opts: RangeOpts = {}) =>
  get<PacingResponse>(`/api/clients/${slug}/meta/pacing?${rangeQuery(opts)}`);

// Alerts
export type Alert = {
  severity: "neg" | "warn" | "info";
  kind: "fatigue" | "cpc_spike" | "underpace" | "no_spend" | string;
  campaign_id: string; campaign_name: string;
  message: string; detail: Record<string, number>;
};
export const metaAlerts = (slug: string) =>
  get<{ client: string; generated_at: string; alerts: Alert[] }>(`/api/clients/${slug}/meta/alerts`);

// Audience & Geo
export type BreakdownRow = { value: string; spend: number; impressions: number; clicks: number; ctr: number; cpc: number };
export const metaAudience = (slug: string, opts: RangeOpts = {}) =>
  get<{ by_age: BreakdownRow[]; by_gender: BreakdownRow[] }>(
    `/api/clients/${slug}/meta/audience?${rangeQuery(opts)}`
  );
export const metaGeoTime = (slug: string, opts: RangeOpts = {}) =>
  get<{ by_region: BreakdownRow[]; by_hour: BreakdownRow[] }>(
    `/api/clients/${slug}/meta/geo-time?${rangeQuery(opts)}`
  );

// ─── sync ────────────────────────────────────────────────────────────────
export const listJobs = (slug?: string, limit = 20) => {
  const q = new URLSearchParams();
  if (slug) q.set("client_slug", slug);
  q.set("limit", String(limit));
  return get<SyncJobRead[]>(`/api/sync/jobs?${q.toString()}`);
};

export type BackfillLevel = "account" | "campaign" | "adset" | "ad";
export type BackfillPayload = { days: number; level?: BackfillLevel };
export const triggerMetaBackfill = (slug: string, body: BackfillPayload) =>
  post<{ accepted: boolean; days: number; level: string }>(
    `/api/sync/meta/${slug}/backfill`,
    { level: "ad", ...body }
  );
