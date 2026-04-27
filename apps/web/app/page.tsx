"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ClientCard } from "@/components/ClientCard";
import { TierBadge } from "@/components/TierBadge";
import {
  createClient, listNiches, portfolioOverview,
  type ClientCreatePayload, type Tier,
} from "@/lib/api";

const COLOR_PRESETS = ["#8A5A3B", "#2B6A4F", "#B5454B", "#3B5A8A", "#6B4A8A", "#6F6B68"];

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

export default function CommandCenter() {
  const qc = useQueryClient();
  const overviewQ = useQuery({ queryKey: ["portfolio-overview"], queryFn: portfolioOverview });
  const nichesQ = useQuery({ queryKey: ["niches"], queryFn: listNiches });

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

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 48px" }}>
        {/* HEADER */}
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 22, gap: 16,
        }}>
          <div>
            <div className="mono" style={{
              fontSize: 10, color: "var(--ink-4)",
              letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600,
              marginBottom: 6,
            }}>
              Portfolio NUX
            </div>
            <h1 style={{
              fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.1,
              margin: 0,
            }}>
              Command Center
            </h1>
            {data && (
              <div className="mono" style={{
                fontSize: 11, color: "var(--ink-3)", marginTop: 6,
                letterSpacing: 0.3,
              }}>
                {data.kpis.active_clients} clientes ativos · MTD desde {fmtDate(data.month_start)}
              </div>
            )}
          </div>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)}>+ Novo cliente</button>
          )}
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

        {/* PRIMARY KPIs — 3 grandes em row */}
        {data && (
          <section style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12, marginBottom: 10,
          }}>
            <PrimaryKpi
              label="Spend MTD"
              value={fmtBRL(data.kpis.portfolio_spend_mtd)}
            />
            <PrimaryKpi
              label="Receita MTD"
              value={fmtBRL(data.kpis.portfolio_revenue_mtd)}
              tone={data.kpis.portfolio_revenue_mtd > 0 ? "pos" : "muted"}
            />
            <PrimaryKpi
              label="ROAS MTD"
              value={`${data.kpis.portfolio_roas_mtd.toFixed(2)}x`}
              tone={
                data.kpis.portfolio_roas_mtd >= 2 ? "pos" :
                data.kpis.portfolio_roas_mtd >= 1 ? "neutral" : "neg"
              }
              hint={
                data.kpis.portfolio_roas_mtd < 1 && data.kpis.portfolio_revenue_mtd === 0
                  ? "tracking pendente"
                  : undefined
              }
            />
          </section>
        )}

        {/* SECONDARY KPIs — chips inline */}
        {data && (
          <section style={{
            display: "flex", flexWrap: "wrap", gap: 6,
            marginBottom: 22,
          }}>
            <SecondaryChip label="Clientes" value={String(data.kpis.active_clients)} />
            <SecondaryChip
              label="Tier S+A"
              value={`${data.kpis.pct_sa.toFixed(0)}%`}
              tone={data.kpis.pct_sa >= 50 ? "pos" : "muted"}
            />
            <SecondaryChip
              label="Alertas críticos"
              value={String(data.kpis.critical_alerts)}
              tone={data.kpis.critical_alerts > 0 ? "neg" : "muted"}
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

        {/* GRID DE CLIENTES */}
        {overviewQ.isLoading && (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando clientes…</p>
        )}
        {data && data.clients.length === 0 && !showForm && (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 16 }}>
              Nenhum cliente cadastrado ainda.
            </p>
            <button className="btn" onClick={() => setShowForm(true)}>+ Criar primeiro cliente</button>
          </div>
        )}
        {data && data.clients.length > 0 && (
          <section style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: 14,
          }}>
            {sortedClients.map((c) => (
              <ClientCard key={c.slug} row={c} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

// ─── PRIMARY KPI tile ──────────────────────────────────────────────────────

function PrimaryKpi({
  label, value, tone = "neutral", hint,
}: { label: string; value: string; tone?: "pos" | "neg" | "neutral" | "muted"; hint?: string }) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "muted" ? "var(--ink-2)" :
    "var(--ink)";

  return (
    <div className="card" style={{
      padding: "16px 18px 14px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)",
        letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
      }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 26, fontWeight: 700, lineHeight: 1.1, color,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
      {hint && (
        <div style={{
          fontSize: 10, color: "var(--ink-4)",
          fontStyle: "italic", marginTop: -2,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ─── SECONDARY KPI chip — denso, inline ────────────────────────────────────

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

// ─── TIER BREAKDOWN — chips compactos ─────────────────────────────────────

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
