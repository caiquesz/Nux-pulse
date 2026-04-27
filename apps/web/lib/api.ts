// Cliente HTTP para a API NUX Pulse — todas as chamadas tipadas.
//
// Todas as requests passam pelo proxy same-origin (app/api/[...path]/route.ts)
// que injeta X-API-Key server-side. Por isso BASE é "" (caminho relativo):
// o browser fala com o próprio domínio Next, que proxia pra Railway.
const BASE = "";

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

type MetaOverviewMetrics = {
  spend: number; impressions: number; clicks: number; reach: number;
  ctr: number; cpc: number;
  messages: number; leads: number; purchases: number; revenue: number; roas: number;
  cost_per_message: number; cost_per_lead: number; cost_per_purchase: number;
  // Breakdown manual (conversões registradas manualmente, já somadas nos totais acima)
  manual_messages?: number;
  manual_leads?: number;
  manual_purchases?: number;
  manual_revenue?: number;
};

export type MetaOverview = {
  client: string;
  platform: "meta";
  period_days: number;
  since: string;
  until: string;
  previous_period: MetaOverviewMetrics & { since: string; until: string };
  deltas: Record<keyof MetaOverviewMetrics, number | null>;
} & MetaOverviewMetrics;

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
  niche_code?: string | null;
  segment?: string | null;
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

// Data health
export type DataHealthResponse = {
  client: string;
  window: { since: string; until: string; days: number };
  expected_days: number;
  days_with_data: number;
  gaps: string[];
  reconciliations: Array<{
    breakdown: string;
    base_spend: number;
    breakdown_spend: number;
    diff_pct: number | null;
    status: "ok" | "missing" | "drift";
  }>;
  last_successful_sync: { job_id: number; finished_at: string; rows_written: number } | null;
  recent_errors: Array<{ id: number; error: string; when: string | null }>;
};
export const metaDataHealth = (slug: string, days = 30) =>
  get<DataHealthResponse>(`/api/clients/${slug}/meta/data-health?days=${days}`);

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

// ═════════════════════════════════════════════════════════════════════════
//  PLANEJAMENTO — Tarefas + Arquivos + Notificações + Equipe
// ═════════════════════════════════════════════════════════════════════════

async function patch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${r.status} ${path} — ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", cache: "no-store" });
  if (!r.ok && r.status !== 204) throw new Error(`${r.status} ${path}`);
}

// ── Team ────────────────────────────────────────────────────────────────
export type TeamMember = {
  id: number; email: string; name: string;
  role: string | null; avatar_color: string | null; is_active: boolean;
};
export const listTeam = () => get<TeamMember[]>("/api/team");
export const createMember = (body: Omit<TeamMember, "id" | "is_active">) =>
  post<TeamMember>("/api/team", body);
export const updateMember = (id: number, body: Partial<TeamMember>) =>
  patch<TeamMember>(`/api/team/${id}`, body);

// ── Tasks ───────────────────────────────────────────────────────────────
export type TaskStatus = "todo" | "doing" | "waiting" | "done";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";
export type TaskPlatform = "meta" | "google" | "tiktok" | "linkedin" | "pinterest" | "geral" | "outro";
export type TaskType =
  | "briefing" | "criativo" | "lancamento" | "otimizacao"
  | "relatorio" | "reuniao" | "aprovacao" | "analise" | "outro";

export type Task = {
  id: number;
  client_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  duration_min: number | null;
  status: TaskStatus;
  priority: TaskPriority;
  platform: TaskPlatform | null;
  task_type: TaskType | null;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_color: string | null;
  ai_scheduled: boolean;
  ai_context: string | null;
  completed_at: string | null;
  created_at: string;
};

export type TaskCreate = {
  title: string;
  description?: string | null;
  due_at?: string | null;
  duration_min?: number | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  platform?: TaskPlatform | null;
  task_type?: TaskType | null;
  assignee_id?: number | null;
  ai_scheduled?: boolean;
  ai_context?: string | null;
};

export type TaskFilters = {
  status?: TaskStatus;
  platform?: TaskPlatform;
  task_type?: TaskType;
  assignee_id?: number;
  priority?: TaskPriority;
  upcoming_days?: number;
};

export const listTasks = (slug: string, filters?: TaskFilters) => {
  const q = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && String(v) !== "") q.set(k, String(v));
    }
  }
  const qs = q.toString();
  return get<Task[]>(`/api/clients/${slug}/tasks${qs ? `?${qs}` : ""}`);
};
export const createTask = (slug: string, body: TaskCreate) =>
  post<Task>(`/api/clients/${slug}/tasks`, body);
export const updateTask = (id: number, body: Partial<TaskCreate & { completed_at?: string | null }>) =>
  patch<Task>(`/api/tasks/${id}`, body);
export const deleteTask = (id: number) => del(`/api/tasks/${id}`);

// ── Files ───────────────────────────────────────────────────────────────
export type FileCategory = "briefing" | "id_visual" | "fluxograma" | "relatorio" | "contrato" | "outros";

export type ClientFile = {
  id: number;
  client_id: number;
  name: string;
  storage_path: string | null;
  external_url: string | null;
  category: FileCategory;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  uploaded_by_id: number | null;
  uploaded_by_name: string | null;
  created_at: string;
  download_url: string | null;
};

export const listFiles = (slug: string, category?: FileCategory) => {
  const q = category ? `?category=${category}` : "";
  return get<ClientFile[]>(`/api/clients/${slug}/files${q}`);
};

export const uploadFile = async (
  slug: string,
  file: File,
  category: FileCategory = "outros",
  description?: string,
  uploadedById?: number,
): Promise<ClientFile> => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", category);
  if (description) fd.append("description", description);
  if (uploadedById) fd.append("uploaded_by_id", String(uploadedById));
  const r = await fetch(`${BASE}/api/clients/${slug}/files`, { method: "POST", body: fd, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

export const addExternalFile = (slug: string, body: { name: string; external_url: string; category?: FileCategory; description?: string | null }) =>
  post<ClientFile>(`/api/clients/${slug}/files/external`, body);

export const updateFile = (id: number, body: { name?: string; category?: FileCategory; description?: string | null }) =>
  patch<ClientFile>(`/api/files/${id}`, body);
export const deleteFile = (id: number) => del(`/api/files/${id}`);

// ── Notifications ───────────────────────────────────────────────────────
export type Notification = {
  id: number;
  recipient_id: number | null;
  client_id: number | null;
  client_slug: string | null;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  ref_type: string | null;
  ref_id: number | null;
  read_at: string | null;
  created_at: string;
};

export const listNotifications = (unreadOnly = false, limit = 30) => {
  const q = new URLSearchParams();
  if (unreadOnly) q.set("unread_only", "true");
  q.set("limit", String(limit));
  return get<Notification[]>(`/api/notifications?${q.toString()}`);
};
export const countUnread = () => get<{ count: number }>("/api/notifications/count");
export const markNotificationRead = (id: number) =>
  post<{ ok: boolean }>(`/api/notifications/${id}/read`, {});
export const markAllNotificationsRead = () =>
  post<{ updated: number }>("/api/notifications/mark-all-read", {});

// ═════════════════════════════════════════════════════════════════════════
//  CONVERSÕES MANUAIS
// ═════════════════════════════════════════════════════════════════════════

export type ConvKind = "purchase" | "lead" | "message";

export type AttributionSource = "manual" | "trackcore" | string;

export type ManualConversion = {
  id: number;
  client_id: number;
  date: string; // YYYY-MM-DD
  kind: ConvKind;
  count: number;
  revenue: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  notes: string | null;
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: string;
  // Atribuicao (preenchida quando vem do Trackcore via webhook)
  attribution_source: AttributionSource;
  external_event_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
};

export type ManualConversionCreatePayload = {
  date: string;
  kind: ConvKind;
  count?: number;
  revenue?: number | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  notes?: string | null;
  created_by_id?: number | null;
};

export const listManualConversions = (slug: string, opts: { since?: string; until?: string; kind?: ConvKind } = {}) => {
  const q = new URLSearchParams();
  if (opts.since) q.set("since", opts.since);
  if (opts.until) q.set("until", opts.until);
  if (opts.kind) q.set("kind", opts.kind);
  const qs = q.toString();
  return get<ManualConversion[]>(`/api/clients/${slug}/manual-conversions${qs ? `?${qs}` : ""}`);
};

export const createManualConversion = (slug: string, body: ManualConversionCreatePayload) =>
  post<ManualConversion>(`/api/clients/${slug}/manual-conversions`, body);

export const updateManualConversion = (id: number, body: Partial<ManualConversionCreatePayload>) =>
  patch<ManualConversion>(`/api/manual-conversions/${id}`, body);

export const deleteManualConversion = (id: number) =>
  del(`/api/manual-conversions/${id}`);

// ═════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — portfolio
// ═════════════════════════════════════════════════════════════════════════

export type Tier = "S" | "A" | "B" | "C" | "D";

export type DailyPoint = { date: string; spend: number; revenue: number };

export type ClientPortfolioRow = {
  slug: string;
  name: string;
  niche_code: string | null;
  accent_color: string | null;
  tier: Tier | null;
  score: number | null;
  delta_vs_prev: number | null;
  score_updated_at: string | null;
  monthly_budget: number | null;
  monthly_revenue_goal: number | null;
  spend: number;
  revenue: number;
  roas: number | null;
  daily_series: DailyPoint[];
  last_sync_date: string | null;
  alerts: { neg: number; warn: number; info: number; pos: number };
};

export type PeriodKey = "7d" | "30d" | "90d" | "mtd" | "ytd" | "custom";

export type PortfolioOverview = {
  as_of: string;
  period: {
    since: string;
    until: string;
    label: PeriodKey;
    days: number;
  };
  kpis: {
    active_clients: number;
    portfolio_spend: number;
    portfolio_revenue: number;
    portfolio_roas: number;
    pct_sa: number;
    critical_alerts: number;
    avg_delta_7d: number | null;
  };
  tier_breakdown: Record<"S" | "A" | "B" | "C" | "D" | "none", number>;
  daily_series: DailyPoint[];
  clients: ClientPortfolioRow[];
};

export type PortfolioOverviewOpts = {
  period?: PeriodKey;
  since?: string;
  until?: string;
};

export const portfolioOverview = (opts: PortfolioOverviewOpts = {}) => {
  const q = new URLSearchParams();
  if (opts.period) q.set("period", opts.period);
  if (opts.since) q.set("since", opts.since);
  if (opts.until) q.set("until", opts.until);
  const qs = q.toString();
  return get<PortfolioOverview>(`/api/portfolio/overview${qs ? `?${qs}` : ""}`);
};

// ─── niches ──────────────────────────────────────────────────────────────
export type Niche = { code: string; name: string; created_at: string };
export const listNiches = () => get<Niche[]>("/api/niches");

export type NicheBand = "pos" | "neutral" | "neg" | null;

export type NicheComparisonClient = {
  slug: string;
  name: string;
  accent_color: string | null;
  tier: Tier | null;
  score: number | null;
  score_updated_at: string | null;
  monthly_budget: number | null;
  monthly_revenue_goal: number | null;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr_pct: number | null;
    cpc: number | null;
    revenue: number;
    roas: number | null;
    messages: number;
    leads: number;
    purchases: number;
  };
  mtd_spend: number;
  mtd_revenue: number;
  ranks: {
    score: number | null;
    ctr: number | null;
    cpc: number | null;
    roas: number | null;
  };
  bands: {
    ctr: NicheBand;
    cpc: NicheBand;
    roas: NicheBand;
  };
};

export type NicheBenchmarkBand = { p25: number; p50: number; p75: number };

export type NicheComparison = {
  niche: { code: string; name: string; n_clients: number };
  window: { since: string; until: string; days: number };
  benchmarks: {
    industry: Record<string, NicheBenchmarkBand>;
    portfolio: Record<string, NicheBenchmarkBand>;
  };
  portfolio_avg: { ctr_pct: number | null; cpc: number | null; roas: number | null };
  clients: NicheComparisonClient[];
};

export const nicheComparison = (code: string, days = 30) =>
  get<NicheComparison>(`/api/portfolio/niches/${code}/comparison?days=${days}`);
