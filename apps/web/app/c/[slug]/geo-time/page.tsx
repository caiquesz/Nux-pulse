"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { metaGeoTime, type BreakdownRow } from "@/lib/api";
import { fmtBRL, fmtIntCompact, fmtPct } from "@/lib/fmt";

export default function GeoTimePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);

  const q = useQuery({
    queryKey: ["meta-geotime", slug, days],
    queryFn: () => metaGeoTime(slug, { days }),
    enabled: !!slug,
  });

  const byHour = q.data?.by_hour ?? [];
  const byRegion = q.data?.by_region ?? [];
  const empty = !q.isLoading && byHour.length + byRegion.length === 0;

  // Normaliza o hour: Meta manda algo tipo "14:00:00 - 14:59:59"
  const hourRows = [...byHour].sort((a, b) => a.value.localeCompare(b.value));
  const maxHourSpend = Math.max(1, ...hourRows.map((r) => r.spend));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">08 — GEO & HORÁRIO</div>
          <h1>Geografia &amp; Horário</h1>
          <div className="sub">Top regiões + heatmap por hora · {days} dias</div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
        </div>
      </div>

      {empty && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          Breakdowns de geo/hora aparecem após o próximo <strong>Sincronizar</strong>.
        </div>
      )}

      {byRegion.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Top regiões (por gasto)</h2>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-3)", fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Região</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Gasto</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Impr.</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Cliques</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {byRegion.slice(0, 20).map((r) => (
                <tr key={r.value} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px" }}>{r.value}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(r.spend)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtIntCompact(r.impressions)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtIntCompact(r.clicks)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(r.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hourRows.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Performance por hora{" "}
            <span style={{ color: "var(--ink-4)", fontWeight: 400, fontSize: 11 }}>(timezone da conta)</span>
          </h2>
          <div style={{ display: "grid", gap: 6 }}>
            {hourRows.map((r) => (
              <HourBar key={r.value} row={r} max={maxHourSpend} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function HourBar({ row, max }: { row: BreakdownRow; max: number }) {
  const pct = (row.spend / max) * 100;
  const hour = row.value.slice(0, 5); // "14:00:00 -" → "14:00"
  return (
    <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 180px", gap: 12, alignItems: "center" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{hour}</span>
      <div style={{ height: 16, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--hero)" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {fmtBRL(row.spend)} · {fmtIntCompact(row.clicks)} clk · CTR {fmtPct(row.ctr)}
      </div>
    </div>
  );
}
