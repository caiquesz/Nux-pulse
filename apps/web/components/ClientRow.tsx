"use client";
import Link from "next/link";

import { Delta } from "./primitives/Delta";
import { Sparkline } from "./primitives/Sparkline";
import { TierBadge } from "./TierBadge";
import type { ClientPortfolioRow } from "@/lib/api";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `R$ ${(v / 1000).toFixed(0)}k`;
  if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmtBRL(v);
};

/**
 * Row densa de cliente — pattern "list-card hybrid" (Posthog/Linear).
 * Cabe 7-15 clientes sem rolar, escala bem ate 30+.
 */
export function ClientRow({ row }: { row: ClientPortfolioRow }) {
  const accent = row.accent_color ?? "var(--ink-3)";
  const totalAlerts = row.alerts.neg + row.alerts.warn + row.alerts.info;
  const series = row.daily_series.map((d) => d.spend);
  const labels = row.daily_series.map((d) =>
    new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
  );

  return (
    <Link
      href={`/c/${row.slug}/overview`}
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(180px, 1.4fr) auto minmax(120px, 1.2fr) auto auto auto auto",
        alignItems: "center",
        gap: 18,
        padding: "14px 16px",
        textDecoration: "none",
        color: "var(--ink)",
        transition: "background 120ms ease-out, border-color 120ms ease-out",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
        e.currentTarget.style.borderColor = "var(--border-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "";
        e.currentTarget.style.borderColor = "";
      }}
    >
      {/* col 1: accent dot + nome + nicho */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: accent, flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {row.name}
          </div>
          <div className="mono" style={{
            fontSize: 10, color: "var(--ink-4)", marginTop: 2,
            letterSpacing: 0.3, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {row.niche_code ?? "sem nicho"}
          </div>
        </div>
      </div>

      {/* col 2: tier + score */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TierBadge tier={row.tier} size="md" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <span className="mono" style={{
            fontSize: 18, fontWeight: 700, lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: row.score === null ? "var(--ink-4)" : "var(--ink)",
          }}>
            {row.score ?? "—"}
          </span>
          {row.delta_vs_prev !== null && row.delta_vs_prev !== 0 ? (
            <Delta value={row.delta_vs_prev} suffix="" />
          ) : (
            <span className="mono" style={{
              fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.4, textTransform: "uppercase",
            }}>
              score
            </span>
          )}
        </div>
      </div>

      {/* col 3: sparkline (spend daily) */}
      <div style={{ minWidth: 100 }}>
        <div className="mono" style={{
          fontSize: 9, color: "var(--ink-4)",
          letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3,
        }}>
          Spend diário
        </div>
        {series.length > 1 ? (
          <Sparkline
            series={series}
            labels={labels}
            format={(v) => fmtBRL(v)}
            height={28}
            style="area"
          />
        ) : (
          <div style={{ height: 28, fontSize: 11, color: "var(--ink-4)" }}>—</div>
        )}
      </div>

      {/* col 4: spend total no periodo */}
      <Stat label="Spend" value={fmtCompact(row.spend)} />

      {/* col 5: receita ou roas (mostra o que tem dado) */}
      {row.roas !== null ? (
        <Stat
          label="ROAS"
          value={`${row.roas.toFixed(2)}x`}
          color={
            row.roas >= 2 ? "var(--pos)" :
            row.roas >= 1 ? "var(--ink)" :
            "var(--ink-3)"
          }
        />
      ) : row.revenue > 0 ? (
        <Stat label="Receita" value={fmtCompact(row.revenue)} color="var(--pos)" />
      ) : (
        <Stat label="ROAS" value="—" color="var(--ink-4)" />
      )}

      {/* col 6: alertas indicator */}
      <div style={{ minWidth: 60, textAlign: "center" }}>
        {totalAlerts > 0 ? (
          <span
            className="mono"
            title={`${row.alerts.neg} neg · ${row.alerts.warn} warn · ${row.alerts.info} info`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px",
              background: row.alerts.neg > 0 ? "var(--neg)" : "var(--warn)",
              color: "#fff",
              fontSize: 10, fontWeight: 700, borderRadius: 999,
              letterSpacing: 0.5,
            }}
          >
            ◐ {totalAlerts}
          </span>
        ) : (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>—</span>
        )}
      </div>

      {/* col 7: chevron */}
      <span aria-hidden="true" style={{ color: "var(--ink-4)", fontSize: 14 }}>›</span>
    </Link>
  );
}

function Stat({
  label, value, color,
}: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 78, textAlign: "right" }}>
      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)",
        letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600,
      }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 13, fontWeight: 600, marginTop: 2,
        fontVariantNumeric: "tabular-nums",
        color: color ?? "var(--ink)",
      }}>
        {value}
      </div>
    </div>
  );
}
