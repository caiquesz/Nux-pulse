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

  // Ordena por score desc (clientes sem score vão pro fim)
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
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        {/* HEADER */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px" }}>
              NUX <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>· Command Center</span>
            </h1>
            <p style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 4 }}>
              {data ? (
                <>
                  Snapshot {new Date(data.as_of).toLocaleDateString("pt-BR")} ·{" "}
                  {data.kpis.active_clients} clientes ativos · MTD desde{" "}
                  {new Date(data.month_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </>
              ) : "Carregando portfólio…"}
            </p>
          </div>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)}>+ Novo cliente</button>
          )}
        </header>

        {overviewQ.isError && (
          <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--neg)", marginBottom: 24 }}>
            <strong>Erro carregando portfolio.</strong>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {(overviewQ.error as Error)?.message}
            </div>
          </div>
        )}

        {/* FORM "+ Novo cliente" — inline */}
        {showForm && (
          <form onSubmit={submit} className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Novo cliente</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Nome *</span>
                  <input value={name} onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }} placeholder="Segredos de Minas" required style={inputStyle} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    Slug * <code className="mono" style={{ color: "var(--ink-4)" }}>/c/[slug]</code>
                  </span>
                  <input value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                    placeholder="segredos-de-minas" required pattern="[a-z0-9-]+"
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
                </label>
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Nicho</span>
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
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 5 }}>Cor de destaque</div>
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
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Budget mensal (R$)</span>
                  <input type="number" min="0" step="100" value={budget}
                    onChange={(e) => setBudget(e.target.value)} placeholder="10000" style={inputStyle} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Meta receita mensal (R$)</span>
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

        {/* HEADER STRIP — Portfolio KPIs */}
        {data && (
          <section style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10, marginBottom: 20,
          }}>
            <KpiTile label="Clientes" value={String(data.kpis.active_clients)} />
            <KpiTile label="Spend MTD" value={fmtBRL(data.kpis.portfolio_spend_mtd)} />
            <KpiTile label="Receita MTD" value={fmtBRL(data.kpis.portfolio_revenue_mtd)} />
            <KpiTile label="ROAS MTD"
              value={`${data.kpis.portfolio_roas_mtd.toFixed(2)}x`}
              tone={data.kpis.portfolio_roas_mtd >= 2 ? "pos" : data.kpis.portfolio_roas_mtd >= 1 ? "neutral" : "neg"} />
            <KpiTile label="% Tier S/A"
              value={`${data.kpis.pct_sa.toFixed(0)}%`}
              tone={data.kpis.pct_sa >= 50 ? "pos" : data.kpis.pct_sa >= 25 ? "neutral" : "neg"} />
            <KpiTile label="Alertas críticos"
              value={String(data.kpis.critical_alerts)}
              tone={data.kpis.critical_alerts > 0 ? "neg" : "pos"} />
            <KpiTile label="Δ score 7d"
              value={data.kpis.avg_delta_7d === null ? "—" :
                (data.kpis.avg_delta_7d > 0 ? `+${data.kpis.avg_delta_7d.toFixed(1)}` : data.kpis.avg_delta_7d.toFixed(1))}
              tone={data.kpis.avg_delta_7d === null ? "neutral" :
                data.kpis.avg_delta_7d > 0 ? "pos" : "neg"} />
          </section>
        )}

        {/* TIER BREAKDOWN BAR */}
        {data && (
          <section style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 24,
            padding: "10px 14px",
            background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
          }}>
            <span style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.5, textTransform: "uppercase", marginRight: 6 }}>
              Distribuição
            </span>
            {(["S", "A", "B", "C", "D"] as Tier[]).map((t) => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TierBadge tier={t} size="sm" />
                <span className="mono" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                  {data.tier_breakdown[t]}
                </span>
              </span>
            ))}
            {data.tier_breakdown.none > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                <TierBadge tier={null} size="sm" />
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  {data.tier_breakdown.none} sem score
                </span>
              </span>
            )}
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
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
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

// ─── KpiTile inline (versão simples — sem sparkline) ───────────────────────

function KpiTile({
  label, value, tone = "neutral",
}: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }) {
  const color = tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--ink)";
  return (
    <div className="card" style={{ padding: "10px 14px" }}>
      <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 20, fontWeight: 700, marginTop: 4, color, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

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
