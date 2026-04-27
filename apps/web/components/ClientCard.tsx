"use client";
import Link from "next/link";

import { Delta } from "./primitives/Delta";
import { TierBadge } from "./TierBadge";
import type { ClientPortfolioRow } from "@/lib/api";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function ClientCard({ row }: { row: ClientPortfolioRow }) {
  const accent = row.accent_color ?? "var(--ink-4)";
  const totalAlerts = row.alerts.neg + row.alerts.warn + row.alerts.info;
  const roas = row.mtd_spend > 0 ? row.mtd_revenue / row.mtd_spend : 0;

  return (
    <Link
      href={`/c/${row.slug}/overview`}
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "4px 1fr",
        textDecoration: "none",
        color: "var(--ink)",
        padding: 0,
        overflow: "hidden",
        transition: "border-color 160ms, transform 160ms",
      }}
    >
      {/* accent line lateral */}
      <div style={{ background: accent, width: 4, height: "100%" }} />

      <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
        {/* HEADER — tier + nome + alerts */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TierBadge tier={row.tier} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.name}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
              {row.niche_code ?? "sem nicho"}
            </div>
          </div>
          {totalAlerts > 0 && (
            <span
              className="mono"
              title={`${row.alerts.neg} neg · ${row.alerts.warn} warn · ${row.alerts.info} info`}
              style={{
                background: row.alerts.neg > 0 ? "var(--neg)" : "var(--warn)",
                color: "#fff",
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              ◐ {totalAlerts}
            </span>
          )}
        </div>

        {/* SCORE + DELTA */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            className="mono"
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: row.score === null ? "var(--ink-4)" : "var(--ink)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {row.score ?? "—"}
          </span>
          {row.delta_vs_prev !== null && row.delta_vs_prev !== 0 && (
            <Delta value={row.delta_vs_prev} suffix="" />
          )}
          <span style={{ fontSize: 10, color: "var(--ink-4)" }}>score</span>
        </div>

        {/* MTD spend + revenue */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          paddingTop: 8,
          borderTop: "1px solid var(--border)",
        }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Spend MTD
            </div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
              {fmtBRL(row.mtd_spend)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              ROAS MTD
            </div>
            <div className="mono" style={{
              fontSize: 12, fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums",
              color: roas >= 2 ? "var(--pos)" : roas >= 1 ? "var(--ink)" : "var(--ink-4)",
            }}>
              {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
