"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { TierBadge } from "@/components/TierBadge";
import { nicheComparison, type NicheBand, type NicheComparison, type NicheComparisonClient } from "@/lib/api";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const bandColor = (band: NicheBand): string => {
  if (band === "pos") return "var(--pos)";
  if (band === "neg") return "var(--neg)";
  return "var(--ink-2)";
};

function MetricCell({
  value, format, band, rank, total,
}: {
  value: number | null;
  format: (v: number) => string;
  band: NicheBand;
  rank: number | null;
  total: number;
}) {
  if (value === null) {
    return <span className="mono" style={{ color: "var(--ink-4)" }}>—</span>;
  }
  const isLeader = rank === 1 && total > 1;
  return (
    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4, justifyContent: "center" }}>
      <span
        className="mono"
        style={{
          color: bandColor(band),
          fontWeight: isLeader ? 700 : 500,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {format(value)}
      </span>
      {isLeader && <span style={{ fontSize: 10, color: "var(--pos)" }}>◀</span>}
    </div>
  );
}

const fmtPct = (v: number) => `${v.toFixed(2)}%`;
const fmtMoney = (v: number) => `R$ ${v.toFixed(2)}`;
const fmtRoas = (v: number) => `${v.toFixed(2)}x`;

export default function NichoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const q = useQuery({
    queryKey: ["niche-comparison", code],
    queryFn: () => nicheComparison(code, 30),
  });

  const data = q.data;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* HEADER */}
        <header style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 6 }}>
            <Link href="/" style={{ color: "var(--ink-3)", textDecoration: "none" }}>← Command Center</Link>
            <span style={{ marginLeft: 8 }}>· Comparativo</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px" }}>
            {data ? data.niche.name : "Carregando…"}
            {data && (
              <span style={{ color: "var(--ink-3)", fontWeight: 500, fontSize: 14, marginLeft: 12 }}>
                {data.niche.n_clients} {data.niche.n_clients === 1 ? "cliente" : "clientes"}
              </span>
            )}
          </h1>
          {data && (
            <p style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 4 }}>
              Janela: últimos {data.window.days} dias ·{" "}
              {new Date(data.window.since).toLocaleDateString("pt-BR")} →{" "}
              {new Date(data.window.until).toLocaleDateString("pt-BR")}
            </p>
          )}
        </header>

        {q.isLoading && (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando comparativo…</p>
        )}

        {q.isError && (
          <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--neg)" }}>
            <strong>Erro carregando comparativo.</strong>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {(q.error as Error)?.message}
            </div>
          </div>
        )}

        {data && data.clients.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <p style={{ color: "var(--ink-3)" }}>
              Nenhum cliente cadastrado nesse nicho ainda.
            </p>
          </div>
        )}

        {data && data.clients.length === 1 && (
          <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--warn)", marginBottom: 16 }}>
            Apenas 1 cliente nesse nicho. Comparativo só faz sentido com 2+ — você pode adicionar nicho a outros clientes pela home (Command Center → Editar cliente).
          </div>
        )}

        {data && data.clients.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <ComparisonTable data={data} />
          </div>
        )}
      </div>
    </main>
  );
}

function ComparisonTable({ data }: { data: NicheComparison }) {
  const sorted = [...data.clients].sort((a, b) => {
    if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  const total = sorted.length;
  const industry = data.benchmarks.industry;
  const portfolioBench = data.benchmarks.portfolio;
  const portfolioAvg = data.portfolio_avg;

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="mono" style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
      }}>
        <thead>
          <tr style={{
            background: "var(--surface-2)",
            color: "var(--ink-3)",
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}>
            <th style={thStyle}>#</th>
            <th style={{ ...thStyle, textAlign: "left", minWidth: 180 }}>Cliente</th>
            <th style={thStyle}>Tier</th>
            <th style={thStyle}>Score</th>
            <th style={thStyle}>CTR</th>
            <th style={thStyle}>CPC</th>
            <th style={thStyle}>ROAS</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Spend MTD</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Receita MTD</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => <ClientRow key={c.slug} c={c} total={total} />)}

          {/* Linha de referência: portfolio nicho avg (se ≥ 2 clientes) */}
          {(portfolioAvg.ctr_pct !== null || portfolioAvg.cpc !== null || portfolioAvg.roas !== null) && (
            <tr style={refRowStyle}>
              <td style={tdStyle}>~</td>
              <td style={{ ...tdStyle, textAlign: "left", color: "var(--ink-3)" }}>
                <strong style={{ fontWeight: 600 }}>Média do nicho</strong>
                <span style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 6 }}>
                  (entre seus clientes)
                </span>
              </td>
              <td style={tdStyle}>—</td>
              <td style={tdStyle}>—</td>
              <td style={tdStyle}>{portfolioAvg.ctr_pct !== null ? `${portfolioAvg.ctr_pct.toFixed(2)}%` : "—"}</td>
              <td style={tdStyle}>{portfolioAvg.cpc !== null ? fmtBRL(portfolioAvg.cpc) : "—"}</td>
              <td style={tdStyle}>{portfolioAvg.roas !== null ? `${portfolioAvg.roas.toFixed(2)}x` : "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
            </tr>
          )}

          {/* Linha de referência: benchmark industry p50 */}
          {(industry.ctr || industry.cpc || industry.roas) && (
            <tr style={benchRowStyle}>
              <td style={tdStyle}>p50</td>
              <td style={{ ...tdStyle, textAlign: "left", color: "var(--ink-3)" }}>
                <strong style={{ fontWeight: 600 }}>Benchmark mercado</strong>
                <span style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 6 }}>
                  (industry, mediana 2026)
                </span>
              </td>
              <td style={tdStyle}>—</td>
              <td style={tdStyle}>—</td>
              <td style={tdStyle}>{industry.ctr ? `${industry.ctr.p50.toFixed(2)}%` : "—"}</td>
              <td style={tdStyle}>{industry.cpc ? fmtBRL(industry.cpc.p50) : "—"}</td>
              <td style={tdStyle}>{industry.roas ? `${industry.roas.p50.toFixed(2)}x` : "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Legenda das cores */}
      <div style={{
        display: "flex", gap: 16, padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-2)",
        fontSize: 10,
        color: "var(--ink-3)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: "var(--pos)", borderRadius: 2 }} />
          ≥ p75 do mercado
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: "var(--ink-2)", borderRadius: 2 }} />
          entre p25-p75
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: "var(--neg)", borderRadius: 2 }} />
          ≤ p25
        </span>
        <span style={{ marginLeft: "auto", color: "var(--ink-4)" }}>
          ◀ líder do nicho · CPC menor é melhor
        </span>
      </div>
    </div>
  );
}

function ClientRow({ c, total }: { c: NicheComparisonClient; total: number }) {
  const accent = c.accent_color ?? "var(--ink-4)";
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ ...tdStyle, color: "var(--ink-4)", fontWeight: 700 }}>
        {c.ranks.score ?? "—"}
      </td>
      <td style={{ ...tdStyle, textAlign: "left" }}>
        <Link
          href={`/c/${c.slug}/overview`}
          style={{
            color: "var(--ink)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-sans)",
          }}
        >
          <span style={{ width: 3, height: 18, background: accent, borderRadius: 1 }} />
          <span style={{ fontWeight: 600 }}>{c.name}</span>
        </Link>
      </td>
      <td style={tdStyle}><TierBadge tier={c.tier} size="sm" /></td>
      <td style={{ ...tdStyle, fontWeight: 600 }}>{c.score ?? "—"}</td>
      <td style={tdStyle}>
        <MetricCell value={c.metrics.ctr_pct} format={fmtPct} band={c.bands.ctr} rank={c.ranks.ctr} total={total} />
      </td>
      <td style={tdStyle}>
        <MetricCell value={c.metrics.cpc} format={fmtMoney} band={c.bands.cpc} rank={c.ranks.cpc} total={total} />
      </td>
      <td style={tdStyle}>
        <MetricCell value={c.metrics.roas} format={fmtRoas} band={c.bands.roas} rank={c.ranks.roas} total={total} />
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{fmtBRL(c.mtd_spend)}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{fmtBRL(c.mtd_revenue)}</td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "center",
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 12px",
  textAlign: "center",
};

const refRowStyle: React.CSSProperties = {
  borderTop: "2px solid var(--border)",
  background: "var(--surface-2)",
  fontStyle: "italic",
};

const benchRowStyle: React.CSSProperties = {
  borderTop: "1px dashed var(--border)",
  background: "var(--surface-3)",
  fontStyle: "italic",
};
