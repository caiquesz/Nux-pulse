"use client";
import Link from "next/link";

import { Delta } from "./primitives/Delta";
import { TierBadge } from "./TierBadge";
import type { ClientPortfolioRow } from "@/lib/api";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function ClientCard({ row }: { row: ClientPortfolioRow }) {
  const accent = row.accent_color ?? "var(--ink-3)";
  const totalAlerts = row.alerts.neg + row.alerts.warn + row.alerts.info;
  const roas = row.mtd_spend > 0 ? row.mtd_revenue / row.mtd_spend : null;
  const roasTone =
    roas === null ? "var(--ink-4)" :
    roas >= 2 ? "var(--pos)" :
    roas >= 1 ? "var(--ink)" :
    "var(--ink-3)";

  return (
    <article
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        // Top accent border 2px — identidade do cliente sem violar side-stripe ban.
        borderTop: `2px solid ${accent}`,
      }}
    >
      {/* HEADER — nome/nicho a esquerda, tier+score a direita */}
      <header style={{
        padding: "14px 16px 10px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/c/${row.slug}/overview`}
            style={{
              display: "block",
              fontSize: 14, fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "none",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.25,
            }}
            title={row.name}
          >
            {row.name}
          </Link>
          <div className="mono" style={{
            fontSize: 10, color: "var(--ink-4)", marginTop: 3,
            letterSpacing: 0.3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {row.niche_code ?? "sem nicho"}
          </div>
        </div>

        {/* Tier + Score juntos, flexbox alinhado pelo baseline numerico */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <TierBadge tier={row.tier} size="md" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span className="mono" style={{
              fontSize: 22, fontWeight: 700, lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: row.score === null ? "var(--ink-4)" : "var(--ink)",
            }}>
              {row.score ?? "—"}
            </span>
            {row.delta_vs_prev !== null && row.delta_vs_prev !== 0 ? (
              <Delta value={row.delta_vs_prev} suffix="" />
            ) : (
              <span style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                score
              </span>
            )}
          </div>
        </div>
      </header>

      {/* METRICS — 2 cols, ocultando vazios elegantemente */}
      <div style={{
        padding: "10px 16px 12px",
        borderTop: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 4,
      }}>
        <Stat label="Spend MTD" value={fmtBRL(row.mtd_spend)} />
        {roas !== null ? (
          <Stat label="ROAS" value={`${roas.toFixed(2)}x`} valueColor={roasTone} />
        ) : row.mtd_revenue > 0 ? (
          <Stat label="Receita MTD" value={fmtBRL(row.mtd_revenue)} valueColor="var(--pos)" />
        ) : (
          <Stat label="Conversão" value="aguardando" valueColor="var(--ink-4)" italic />
        )}
      </div>

      {/* FOOTER — actions discretas */}
      <footer style={{
        padding: "8px 14px 10px",
        marginTop: "auto",
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
        fontSize: 11,
        background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href={`/c/${row.slug}/overview`}
            style={{
              color: "var(--ink-3)", textDecoration: "none", fontWeight: 500,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            abrir
            <span aria-hidden="true">→</span>
          </Link>
          {row.niche_code && (
            <Link
              href={`/nicho/${row.niche_code}`}
              style={{
                color: "var(--ink-4)", textDecoration: "none",
                borderBottom: "1px dashed var(--ink-4)",
                paddingBottom: 1,
              }}
              title={`Comparativo do nicho ${row.niche_code}`}
            >
              comparar nicho
            </Link>
          )}
        </div>
        {totalAlerts > 0 && (
          <span
            className="mono"
            title={`${row.alerts.neg} neg · ${row.alerts.warn} warn · ${row.alerts.info} info`}
            style={{
              background: row.alerts.neg > 0 ? "var(--neg)" : "var(--warn)",
              color: "#fff",
              fontSize: 9, padding: "2px 7px", borderRadius: 999,
              fontWeight: 700, letterSpacing: 0.5,
            }}
          >
            {totalAlerts} alerta{totalAlerts > 1 ? "s" : ""}
          </span>
        )}
      </footer>
    </article>
  );
}

function Stat({
  label, value, valueColor, italic,
}: {
  label: string;
  value: string;
  valueColor?: string;
  italic?: boolean;
}) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: "var(--ink-4)",
        textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600,
      }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 13, fontWeight: 600, marginTop: 2,
        fontVariantNumeric: "tabular-nums",
        color: valueColor ?? "var(--ink)",
        fontStyle: italic ? "italic" : undefined,
      }}>
        {value}
      </div>
    </div>
  );
}
