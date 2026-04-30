"use client";
import Link from "next/link";

import { Sparkline } from "./primitives/Sparkline";
import type { PortfolioByNiche } from "@/lib/api";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `R$ ${(v / 1000).toFixed(0)}k`;
  if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmtBRL(v);
};

/**
 * Ranking dos nichos do portfolio. Pattern Stripe Sigma + Tableau:
 * tabela densa com mini-bar in-cell pra spend/revenue (sortable visual).
 */
export function NicheRanking({ data }: { data: PortfolioByNiche }) {
  const { niches, totals } = data;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* TOTAL strip no topo */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 0,
        padding: "14px 18px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}>
        <Total label="Nichos ativos" value={String(totals.n_niches)} />
        <Total label="Investimento total" value={fmtBRL(totals.spend)} />
        <Total label="Receita total" value={fmtBRL(totals.revenue)} tone="pos" />
        <Total
          label="ROAS portfolio"
          value={totals.roas !== null ? `${totals.roas.toFixed(2)}x` : "—"}
          tone={
            totals.roas === null ? "muted" :
            totals.roas >= 2 ? "pos" :
            totals.roas >= 1 ? "neutral" : "muted"
          }
        />
      </div>

      {/* Header da tabela */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.4fr) auto minmax(140px, 1.4fr) minmax(80px, 0.6fr) minmax(110px, 1fr) minmax(110px, 1fr) auto",
        gap: 14,
        padding: "8px 18px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        fontSize: 9,
        color: "var(--ink-4)",
        letterSpacing: 0.5,
        textTransform: "uppercase",
        fontWeight: 600,
      }} className="mono">
        <span>Nicho</span>
        <span>Clientes</span>
        <span>Investimento (com %)</span>
        <span style={{ textAlign: "right" }}>Score</span>
        <span style={{ textAlign: "right" }}>Receita</span>
        <span style={{ textAlign: "right" }}>ROAS</span>
        <span style={{ textAlign: "right", minWidth: 90 }}>Trend</span>
      </div>

      {niches.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
          Nenhum nicho cadastrado ainda.
        </div>
      ) : niches.map((n) => {
        const spendPct = totals.max_spend > 0 ? n.spend / totals.max_spend : 0;
        const series = n.daily_series.map((d) => d.spend);

        return (
          <div
            key={n.code ?? "none"}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 1.4fr) auto minmax(140px, 1.4fr) minmax(80px, 0.6fr) minmax(110px, 1fr) minmax(110px, 1fr) auto",
              gap: 14,
              padding: "12px 18px",
              borderBottom: "1px solid var(--border)",
              alignItems: "center",
              transition: "background 120ms ease-out",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {/* Nicho */}
            <div style={{ minWidth: 0 }}>
              {n.code ? (
                <Link
                  href={`/nicho/${n.code}`}
                  style={{
                    color: "var(--ink)", textDecoration: "none",
                    fontWeight: 600, fontSize: 13,
                  }}
                >
                  {n.name}
                </Link>
              ) : (
                <span style={{ color: "var(--ink-3)", fontStyle: "italic", fontSize: 13 }}>
                  {n.name}
                </span>
              )}
            </div>

            {/* Clientes */}
            <span className="mono" style={{
              fontSize: 12, fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: "var(--ink-2)",
              minWidth: 24, textAlign: "right",
            }}>
              {n.n_clients}
            </span>

            {/* Spend bar — mini-bar in-cell estilo Tableau */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                height: 6, flex: 1, minWidth: 60,
                background: "var(--surface-3)", borderRadius: 999,
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  width: `${Math.max(2, spendPct * 100)}%`,
                  background: n.code ? "var(--ink-2)" : "var(--ink-4)",
                  borderRadius: 999,
                  transition: "width 320ms cubic-bezier(0.4, 0, 0.2, 1)",
                }} />
              </div>
              <span className="mono" style={{
                fontSize: 11, fontWeight: 600,
                color: "var(--ink-2)", fontVariantNumeric: "tabular-nums",
                minWidth: 60, textAlign: "right",
              }}>
                {fmtCompact(n.spend)}
              </span>
            </div>

            {/* Score medio */}
            <div style={{ textAlign: "right" }}>
              {n.avg_score !== null ? (
                <span className="mono" style={{
                  fontSize: 14, fontWeight: 700,
                  color:
                    n.avg_score >= 80 ? "var(--pos)" :
                    n.avg_score >= 65 ? "var(--ink)" :
                    n.avg_score >= 50 ? "var(--warn)" :
                    "var(--neg)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {n.avg_score}
                </span>
              ) : (
                <span style={{ color: "var(--ink-4)" }}>—</span>
              )}
            </div>

            {/* Receita */}
            <div style={{ textAlign: "right" }}>
              <span className="mono" style={{
                fontSize: 12, fontWeight: 600,
                color: n.revenue > 0 ? "var(--pos)" : "var(--ink-4)",
                fontVariantNumeric: "tabular-nums",
              }}>
                {n.revenue > 0 ? fmtCompact(n.revenue) : "—"}
              </span>
            </div>

            {/* ROAS */}
            <div style={{ textAlign: "right" }}>
              {n.roas !== null ? (
                <span className="mono" style={{
                  fontSize: 12, fontWeight: 600,
                  color:
                    n.roas >= 2 ? "var(--pos)" :
                    n.roas >= 1 ? "var(--ink)" :
                    "var(--ink-3)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {n.roas.toFixed(2)}x
                </span>
              ) : (
                <span style={{ color: "var(--ink-4)" }}>—</span>
              )}
            </div>

            {/* Sparkline */}
            <div style={{ minWidth: 90 }}>
              {series.length > 1 ? (
                <Sparkline series={series} height={22} style="area" />
              ) : (
                <span style={{ color: "var(--ink-4)", fontSize: 11 }}>—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Total({
  label, value, tone = "neutral",
}: { label: string; value: string; tone?: "pos" | "neg" | "neutral" | "muted" }) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "muted" ? "var(--ink-3)" :
    "var(--ink)";

  return (
    <div>
      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)",
        letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600,
      }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 18, fontWeight: 700, color, marginTop: 3,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
      }}>
        {value}
      </div>
    </div>
  );
}
