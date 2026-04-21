"use client";
import { Delta } from "./Delta";
import { Sparkline } from "./Sparkline";
import type { Kpi } from "@/lib/mock-data";

type Props = {
  kpi: Kpi;
  active?: boolean;
  onClick?: () => void;
  chartStyle?: "line" | "area" | "bar";
};

export function KpiCard({ kpi, active, onClick, chartStyle = "area" }: Props) {
  return (
    <button
      className="card"
      onClick={onClick}
      style={{
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        borderColor: active ? "var(--ink)" : "var(--border)",
        boxShadow: active ? "0 0 0 3px var(--hover)" : "none",
        transition: "border-color 160ms, box-shadow 160ms",
      }}
    >
      <div className="stat">
        <span className="stat-label">{kpi.label}</span>
        <span className="stat-value">{kpi.value}</span>
        <div className="stat-delta">
          <Delta value={kpi.delta} />
          <span className="dim">vs período ant.</span>
        </div>
        <div className="stat-spark">
          <Sparkline series={kpi.series} style={chartStyle} height={36} />
        </div>
      </div>
    </button>
  );
}
