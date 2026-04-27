"use client";
import type { PeriodKey } from "@/lib/api";

const PERIODS: { key: PeriodKey; label: string; tooltip: string }[] = [
  { key: "7d",  label: "7d",  tooltip: "Últimos 7 dias" },
  { key: "30d", label: "30d", tooltip: "Últimos 30 dias (default)" },
  { key: "90d", label: "90d", tooltip: "Últimos 90 dias" },
  { key: "mtd", label: "MTD", tooltip: "Mês até hoje" },
  { key: "ytd", label: "YTD", tooltip: "Ano até hoje" },
];

export function TimePeriodSelector({
  value, onChange,
}: {
  value: PeriodKey;
  onChange: (v: PeriodKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Período"
      style={{
        display: "inline-flex",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 7,
        padding: 2,
        gap: 1,
      }}
    >
      {PERIODS.map((p) => {
        const active = p.key === value;
        return (
          <button
            key={p.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p.key)}
            title={p.tooltip}
            className="mono"
            style={{
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              letterSpacing: 0.5,
              background: active ? "var(--surface-3)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-3)",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              transition: "background 120ms ease-out, color 120ms ease-out",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
