"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { metaFunnel } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/fmt";

export default function FunnelPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);

  const q = useQuery({
    queryKey: ["meta-funnel", slug, days],
    queryFn: () => metaFunnel(slug, { days }),
    enabled: !!slug,
  });

  const stages = q.data?.stages ?? [];
  const topValue = stages[0]?.value ?? 0;
  const otherEntries = Object.entries(q.data?.other_actions ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">04 — FUNIL</div>
          <h1>Funil de conversão</h1>
          <div className="sub">
            {q.isLoading ? "Carregando…" : `Pipeline completo · ${days} dias`}
          </div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
        </div>
      </div>

      {q.isError && (
        <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--neg)" }}>
          Erro ao carregar funil.
        </div>
      )}

      {!q.isLoading && topValue === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          Nenhum dado no período. Rode um <strong>Sincronizar</strong> e tente de novo.
        </div>
      )}

      {topValue > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {stages.map((s, i) => {
              const pct = topValue > 0 ? (s.value / topValue) * 100 : 0;
              const hasData = s.value > 0;
              return (
                <div key={s.key} style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: "var(--ink-4)", marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>
                      {s.label}
                    </div>
                    <div style={{ display: "flex", gap: 14, alignItems: "baseline", fontVariantNumeric: "tabular-nums" }}>
                      {s.conversion_from_prev != null && (
                        <span style={{ fontSize: 11, color: s.conversion_from_prev >= 10 ? "var(--pos)" : "var(--ink-3)" }}>
                          {fmtPct(s.conversion_from_prev)} vs etapa ant.
                        </span>
                      )}
                      <span style={{ fontSize: 16, fontWeight: 700, color: hasData ? "var(--ink)" : "var(--ink-4)" }}>
                        {fmtInt(s.value)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 28, background: "var(--surface-2)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                    <div
                      style={{
                        width: `${Math.max(pct, 0.5)}%`,
                        height: "100%",
                        background: hasData
                          ? `linear-gradient(90deg, var(--hero) 0%, var(--hero-bg) 100%)`
                          : "var(--surface-3)",
                        transition: "width 400ms ease",
                      }}
                    />
                    <div style={{
                      position: "absolute", inset: 0, display: "flex",
                      alignItems: "center", paddingLeft: 10, fontSize: 10,
                      color: "var(--ink-3)", fontVariantNumeric: "tabular-nums",
                    }}>
                      {pct > 0 ? `${pct.toFixed(1)}% do topo` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {stages.length > 1 && stages[stages.length - 1].value > 0 && stages[0].value > 0 && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 32, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Taxa Impressão → Compra
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {fmtPct((stages[stages.length - 1].value / stages[0].value) * 100)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Total de compras
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {fmtInt(stages[stages.length - 1].value)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {otherEntries.length > 0 && (
        <div className="card" style={{ padding: 24, marginTop: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Outras ações registradas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {otherEntries.map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 12px", background: "var(--surface-2)",
                borderRadius: 6, fontSize: 12,
              }}>
                <span className="mono" style={{ color: "var(--ink-3)" }}>{k}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(v)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
