"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { SyncIndicator } from "@/components/SyncIndicator";
import { metaPacing } from "@/lib/api";
import { fmtBRL, fmtPct } from "@/lib/fmt";
import { POLL_MS, useAutoSync } from "@/lib/useAutoSync";

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  on_pace: { label: "no pace", color: "var(--pos)", bg: "var(--pos-bg)" },
  underpace: { label: "atrasado", color: "var(--warn)", bg: "var(--warn-bg)" },
  overpace: { label: "acelerado", color: "var(--neg)", bg: "var(--neg-bg)" },
};

export default function PacingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);
  const sync = useAutoSync(slug);

  const q = useQuery({
    queryKey: ["meta-pacing", slug, days],
    queryFn: () => metaPacing(slug, { days }),
    enabled: !!slug,
    refetchInterval: POLL_MS,
  });

  const data = q.data;
  const campaigns = data?.campaigns ?? [];
  const totals = data?.totals;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">09 — PACING</div>
          <h1>Pacing de budget</h1>
          <div className="sub">
            {q.isLoading ? "Calculando…" : `${campaigns.length} campanhas com budget definido · ${days} dias`}
          </div>
        </div>
        <div className="page-head-actions">
          <SyncIndicator
            label={sync.lastSyncLabel}
            status={sync.lastSyncStatus}
            lastDoneAt={sync.lastDoneAt}
          />
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
        </div>
      </div>

      {totals && totals.expected_spend > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase" }}>Esperado ({days}d)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(totals.expected_spend)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase" }}>Gasto real</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(totals.actual_spend)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase" }}>% do esperado</div>
            <div style={{
              fontSize: 22, fontWeight: 700,
              color: totals.percent_of_expected < 70 ? "var(--warn)" :
                     totals.percent_of_expected > 130 ? "var(--neg)" : "var(--pos)",
            }}>{fmtPct(totals.percent_of_expected)}</div>
          </div>
        </div>
      )}

      {campaigns.length === 0 && !q.isLoading && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          Nenhuma campanha com <code className="mono">daily_budget</code> definido no período.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {campaigns.map((c) => {
          const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.on_pace;
          const fillPct = Math.min(c.percent_of_expected, 200);
          return (
            <div key={c.campaign_id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.campaign_name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                    Budget: {fmtBRL(c.daily_budget)}/dia · Esperado: {fmtBRL(c.expected_spend)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {fmtBRL(c.actual_spend)}
                  </div>
                  <span className="tag" style={{ background: s.bg, color: s.color, fontSize: 10 }}>
                    {s.label} · {fmtPct(c.percent_of_expected)}
                  </span>
                </div>
              </div>

              {/* barra: 100% é o esperado, pode passar */}
              <div style={{ position: "relative", height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(fillPct, 100) / 2}%`,  // escala: 100% = metade da barra
                  height: "100%",
                  background: s.color,
                  transition: "width 300ms ease",
                }} />
                {fillPct > 100 && (
                  <div style={{
                    position: "absolute",
                    left: "50%",
                    width: `${Math.min(fillPct - 100, 100) / 2}%`,
                    height: "100%",
                    background: "var(--neg)",
                    opacity: 0.5,
                  }} />
                )}
                {/* marcador do 100% */}
                <div style={{
                  position: "absolute", left: "50%", top: -2, bottom: -2,
                  width: 2, background: "var(--ink-3)",
                }} />
              </div>
              <div style={{ fontSize: 9, color: "var(--ink-4)", textAlign: "center", marginTop: 2 }}>
                ─ esperado ─
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
