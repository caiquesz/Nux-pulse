"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { CategoryHeatmap } from "@/components/CategoryHeatmap";
import { ClientRow } from "@/components/ClientRow";
import { NicheRanking } from "@/components/NicheRanking";
import { Sparkline } from "@/components/primitives/Sparkline";
import { Tabs, type TabItem } from "@/components/Tabs";
import { TierBadge } from "@/components/TierBadge";
import { TimePeriodSelector } from "@/components/TimePeriodSelector";
import {
  createClient, listNiches, portfolioByCategory, portfolioByNiche, portfolioOverview,
  type ClientCreatePayload, type PeriodKey, type Tier,
} from "@/lib/api";

type ViewKey = "clientes" | "nichos" | "categorias";
const VALID_VIEWS: ViewKey[] = ["clientes", "nichos", "categorias"];

const COLOR_PRESETS = ["#8A5A3B", "#2B6A4F", "#B5454B", "#3B5A8A", "#6B4A8A", "#6F6B68"];
const VALID_PERIODS: PeriodKey[] = ["7d", "30d", "90d", "mtd", "ytd"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  "90d": "últimos 90 dias",
  "mtd": "mês até hoje",
  "ytd": "ano até hoje",
  "custom": "intervalo customizado",
};

export default function CommandCenterPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh", background: "var(--bg)" }} />}>
      <CommandCenter />
    </Suspense>
  );
}

function CommandCenter() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const periodParam = (params?.get("period") ?? "30d") as PeriodKey;
  const period: PeriodKey = VALID_PERIODS.includes(periodParam) ? periodParam : "30d";

  const viewParam = (params?.get("view") ?? "clientes") as ViewKey;
  const view: ViewKey = VALID_VIEWS.includes(viewParam) ? viewParam : "clientes";

  const overviewQ = useQuery({
    queryKey: ["portfolio-overview", period],
    queryFn: () => portfolioOverview({ period }),
  });
  const byNicheQ = useQuery({
    queryKey: ["portfolio-by-niche", period],
    queryFn: () => portfolioByNiche({ period }),
    enabled: view === "nichos",
  });
  const byCatQ = useQuery({
    queryKey: ["portfolio-by-category"],
    queryFn: portfolioByCategory,
    enabled: view === "categorias",
  });
  const nichesQ = useQuery({ queryKey: ["niches"], queryFn: listNiches });

  function updateParams(updates: Record<string, string | null>) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) sp.delete(k); else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(`/${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function setPeriod(p: PeriodKey) {
    updateParams({ period: p === "30d" ? null : p });
  }
  function setView(v: ViewKey) {
    updateParams({ view: v === "clientes" ? null : v });
  }

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [accent, setAccent] = useState(COLOR_PRESETS[0]);
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState("");
  const [nicheCode, setNicheCode] = useState<string>("");

  const create = useMutation({
    mutationFn: (body: ClientCreatePayload) => createClient(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio-overview"] });
      setShowForm(false);
      setName(""); setSlug(""); setSlugTouched(false);
      setBudget(""); setGoal(""); setNicheCode("");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    create.mutate({
      name: name.trim(),
      slug: slug.trim(),
      accent_color: accent,
      monthly_budget: budget ? Number(budget) : null,
      monthly_revenue_goal: goal ? Number(goal) : null,
      niche_code: nicheCode || null,
    } as ClientCreatePayload);
  }

  const data = overviewQ.data;
  const sortedClients = useMemo(() => {
    if (!data) return [];
    return [...data.clients].sort((a, b) => {
      if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
  }, [data]);

  // sparkline data agregada do portfolio
  const portfolioSpendSeries = data?.daily_series.map((d) => d.spend) ?? [];
  const portfolioRevenueSeries = data?.daily_series.map((d) => d.revenue) ?? [];
  const sparklineLabels = data?.daily_series.map((d) =>
    new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
  ) ?? [];

  return (
    <main
      className="stage-glow"
      style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 24px 56px" }}>
        {/* HEADER */}
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 24, gap: 24, flexWrap: "wrap",
        }}>
          <div>
            <div className="mono" style={{
              fontSize: 10, color: "var(--ink-4)",
              letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600,
              marginBottom: 6,
            }}>
              Portfolio NUX
            </div>
            <h1 style={{
              fontSize: 28, fontWeight: 700, letterSpacing: "-0.6px", lineHeight: 1.05,
              margin: 0,
            }}>
              Command Center
            </h1>
            {data && (
              <div className="mono" style={{
                fontSize: 11, color: "var(--ink-3)", marginTop: 7,
                letterSpacing: 0.3,
              }}>
                {data.kpis.active_clients} clientes · {PERIOD_LABEL[period]} · {fmtDate(data.period.since)} → {fmtDate(data.period.until)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TimePeriodSelector value={period} onChange={setPeriod} />
            {!showForm && (
              <button className="btn" onClick={() => setShowForm(true)}>+ Cliente</button>
            )}
          </div>
        </header>

        {overviewQ.isError && (
          <div className="card" style={{ padding: 16, marginBottom: 24, color: "var(--neg)" }}>
            <strong>Erro carregando portfolio.</strong>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {(overviewQ.error as Error)?.message}
            </div>
          </div>
        )}

        {/* FORM "+ Novo cliente" */}
        {showForm && (
          <form onSubmit={submit} className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Novo cliente</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={lblStyle}>Nome *</span>
                  <input value={name} onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }} placeholder="Segredos de Minas" required style={inputStyle} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={lblStyle}>
                    Slug * <code className="mono" style={{ color: "var(--ink-4)" }}>/c/[slug]</code>
                  </span>
                  <input value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                    placeholder="segredos-de-minas" required pattern="[a-z0-9-]+"
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
                </label>
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={lblStyle}>Nicho</span>
                <select
                  value={nicheCode}
                  onChange={(e) => setNicheCode(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— escolher —</option>
                  {nichesQ.data?.map((n) => (
                    <option key={n.code} value={n.code}>{n.name}</option>
                  ))}
                </select>
              </label>

              <div>
                <div style={{ ...lblStyle, marginBottom: 5 }}>Cor de destaque</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {COLOR_PRESETS.map((c) => (
                    <button key={c} type="button" onClick={() => setAccent(c)} aria-label={c}
                      style={{
                        width: 24, height: 24, borderRadius: 5, background: c,
                        border: accent === c ? "2px solid var(--ink)" : "1px solid var(--border)",
                        cursor: "pointer",
                      }} />
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={lblStyle}>Budget mensal (R$)</span>
                  <input type="number" min="0" step="100" value={budget}
                    onChange={(e) => setBudget(e.target.value)} placeholder="10000" style={inputStyle} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={lblStyle}>Meta receita mensal (R$)</span>
                  <input type="number" min="0" step="100" value={goal}
                    onChange={(e) => setGoal(e.target.value)} placeholder="50000" style={inputStyle} />
                </label>
              </div>

              {create.isError && (
                <div style={{ color: "var(--neg)", fontSize: 12 }}>{(create.error as Error).message}</div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn ghost" onClick={() => setShowForm(false)} disabled={create.isPending}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={create.isPending}>
                  {create.isPending ? "Salvando…" : "Criar cliente"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* PRIMARY KPIs com sparkline */}
        {data && (
          <section style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12, marginBottom: 12,
          }}>
            <KpiTile
              label="Spend"
              value={fmtBRL(data.kpis.portfolio_spend)}
              series={portfolioSpendSeries}
              labels={sparklineLabels}
              tooltipFmt={fmtBRL}
            />
            <KpiTile
              label="Receita"
              value={fmtBRL(data.kpis.portfolio_revenue)}
              series={portfolioRevenueSeries}
              labels={sparklineLabels}
              tooltipFmt={fmtBRL}
              tone={data.kpis.portfolio_revenue > 0 ? "pos" : "muted"}
            />
            <KpiTile
              label="ROAS"
              value={`${data.kpis.portfolio_roas.toFixed(2)}x`}
              tone={
                data.kpis.portfolio_roas >= 2 ? "pos" :
                data.kpis.portfolio_roas >= 1 ? "neutral" : "muted"
              }
              hint={
                data.kpis.portfolio_roas < 1 && data.kpis.portfolio_revenue === 0
                  ? "tracking pendente"
                  : undefined
              }
            />
            <KpiTile
              label="Alertas críticos"
              value={String(data.kpis.critical_alerts)}
              tone={data.kpis.critical_alerts > 0 ? "neg" : "muted"}
            />
          </section>
        )}

        {/* SECONDARY chips: clientes / tier / delta */}
        {data && (
          <section style={{
            display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
            marginBottom: 22,
          }}>
            <SecondaryChip label="Clientes" value={String(data.kpis.active_clients)} />
            <SecondaryChip
              label="Tier S+A"
              value={`${data.kpis.pct_sa.toFixed(0)}%`}
              tone={data.kpis.pct_sa >= 50 ? "pos" : "muted"}
            />
            <SecondaryChip
              label="Δ score 7d"
              value={
                data.kpis.avg_delta_7d === null ? "—" :
                data.kpis.avg_delta_7d > 0 ? `+${data.kpis.avg_delta_7d.toFixed(1)}` :
                data.kpis.avg_delta_7d.toFixed(1)
              }
              tone={
                data.kpis.avg_delta_7d === null ? "muted" :
                data.kpis.avg_delta_7d > 0 ? "pos" : "neg"
              }
            />
            <span style={{ flex: 1 }} />
            <TierBreakdownChips breakdown={data.tier_breakdown} />
          </section>
        )}

        {/* TABS — clientes / nichos / categorias */}
        {data && (
          <div style={{ marginBottom: 16 }}>
            <Tabs<ViewKey>
              value={view}
              onChange={setView}
              items={[
                { key: "clientes", label: "Clientes", count: data.kpis.active_clients },
                { key: "nichos", label: "Por nicho", count: Object.keys(data.tier_breakdown).filter((k) => k !== "none").length },
                { key: "categorias", label: "Por categoria", hint: "Score por categoria × nicho" },
              ] as TabItem<ViewKey>[]}
            />
          </div>
        )}

        {/* TAB CONTENT */}
        {view === "clientes" && (
          <>
            {overviewQ.isLoading && <SkeletonList />}
            {data && data.clients.length === 0 && !showForm && (
              <div className="card" style={{ padding: 32, textAlign: "center" }}>
                <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 16 }}>
                  Nenhum cliente cadastrado ainda.
                </p>
                <button className="btn" onClick={() => setShowForm(true)}>+ Criar primeiro cliente</button>
              </div>
            )}
            {data && data.clients.length > 0 && (
              <section className="stagger-fade-up" style={{ display: "grid", gap: 8 }}>
                {sortedClients.map((c) => (
                  <ClientRow key={c.slug} row={c} />
                ))}
              </section>
            )}
          </>
        )}

        {view === "nichos" && (
          <>
            {byNicheQ.isLoading && <SkeletonList />}
            {byNicheQ.data && <NicheRanking data={byNicheQ.data} />}
            {byNicheQ.isError && (
              <div className="card" style={{ padding: 16, color: "var(--neg)" }}>
                Erro: {(byNicheQ.error as Error).message}
              </div>
            )}
          </>
        )}

        {view === "categorias" && (
          <>
            {byCatQ.isLoading && <SkeletonList />}
            {byCatQ.data && <CategoryHeatmap data={byCatQ.data} />}
            {byCatQ.isError && (
              <div className="card" style={{ padding: 16, color: "var(--neg)" }}>
                Erro: {(byCatQ.error as Error).message}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ─── PRIMARY KPI tile com sparkline opcional ───────────────────────────────

function KpiTile({
  label, value, tone = "neutral", hint, series, labels, tooltipFmt,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral" | "muted";
  hint?: string;
  series?: number[];
  labels?: string[];
  tooltipFmt?: (v: number) => string;
}) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "muted" ? "var(--ink-2)" :
    "var(--ink)";

  return (
    <div className="card" style={{
      padding: "14px 16px 12px",
      display: "flex", flexDirection: "column", gap: 4,
      minHeight: 110,
    }}>
      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)",
        letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
      }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 24, fontWeight: 700, lineHeight: 1.1, color,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
      {hint && (
        <div style={{
          fontSize: 10, color: "var(--ink-4)", fontStyle: "italic",
        }}>
          {hint}
        </div>
      )}
      {series && series.length > 1 && (
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <Sparkline
            series={series}
            labels={labels}
            format={tooltipFmt}
            height={26}
            style="area"
          />
        </div>
      )}
    </div>
  );
}

function SecondaryChip({
  label, value, tone = "neutral",
}: { label: string; value: string; tone?: "pos" | "neg" | "neutral" | "muted" }) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "muted" ? "var(--ink-3)" :
    "var(--ink-2)";

  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 8,
      padding: "5px 11px",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 6,
      fontSize: 11,
    }}>
      <span className="mono" style={{
        fontSize: 9, color: "var(--ink-4)",
        letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600,
      }}>
        {label}
      </span>
      <span className="mono" style={{
        fontSize: 12, fontWeight: 700, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </span>
  );
}

function TierBreakdownChips({
  breakdown,
}: { breakdown: Record<"S" | "A" | "B" | "C" | "D" | "none", number> }) {
  return (
    <div style={{
      display: "inline-flex", gap: 4, alignItems: "center",
      padding: "5px 10px",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 6,
    }}>
      <span className="mono" style={{
        fontSize: 9, color: "var(--ink-4)",
        letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600,
        marginRight: 4,
      }}>
        Distribuição
      </span>
      {(["S", "A", "B", "C", "D"] as Tier[]).map((t) => {
        const n = breakdown[t];
        const dim = n === 0;
        return (
          <span key={t} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            opacity: dim ? 0.4 : 1,
          }}>
            <TierBadge tier={t} size="sm" />
            <span className="mono" style={{
              fontSize: 11, fontWeight: 600,
              color: "var(--ink-2)", fontVariantNumeric: "tabular-nums",
              minWidth: 8,
            }}>
              {n}
            </span>
          </span>
        );
      })}
      {breakdown.none > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <TierBadge tier={null} size="sm" />
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {breakdown.none}
          </span>
        </span>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="card"
          style={{
            height: 60,
            opacity: 0.5,
            animation: "skeleton-pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

const lblStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--ink-3)",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  outline: "none",
};
