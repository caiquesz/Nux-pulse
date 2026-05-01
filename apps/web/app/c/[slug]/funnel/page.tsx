"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { SyncIndicator } from "@/components/SyncIndicator";
import { metaFunnel } from "@/lib/api";
import { fmtInt, fmtPct, fmtPctAdaptive } from "@/lib/fmt";
import { POLL_MS, useAutoSync } from "@/lib/useAutoSync";

export default function FunnelPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);
  const sync = useAutoSync(slug);

  const q = useQuery({
    queryKey: ["meta-funnel", slug, days],
    queryFn: () => metaFunnel(slug, { days }),
    enabled: !!slug,
    refetchInterval: POLL_MS,
  });

  const stages = q.data?.stages ?? [];
  const topValue = stages[0]?.value ?? 0;

  const otherEntries = Object.entries(q.data?.other_actions ?? {}).sort((a, b) => b[1] - a[1]);
  const totalOther = otherEntries.reduce((s, [, v]) => s + v, 0);

  const finalStage = [...stages].reverse().find((s) => s.value > 0);
  const endToEndPct = topValue > 0 && finalStage && finalStage.key !== "impressions"
    ? (finalStage.value / topValue) * 100
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">04 — FUNIL</div>
          <h1>Funil de conversão</h1>
          <div className="sub">Impressão → Clique → LP → Carrinho → Checkout → Compra · {days} dias</div>
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

      {q.isError && (
        <div className="card" style={{ padding: 16,  }}>
          Erro ao carregar funil.
        </div>
      )}

      {!q.isLoading && topValue === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          Nenhum dado no período. Rode um <strong>Sincronizar</strong> e tente de novo.
        </div>
      )}

      {topValue > 0 && (
        <>
          {/* Resumo do funil */}
          <div
            className="card"
            style={{
              padding: 24,
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 20,
            }}
          >
            <Stat label="Topo (impressões)" value={fmtInt(stages[0].value)} />
            {endToEndPct !== null && finalStage ? (
              <>
                <Stat label={`Fundo (${finalStage.label.toLowerCase()})`} value={fmtInt(finalStage.value)} />
                <Stat
                  label="Conversão end-to-end"
                  value={fmtPctAdaptive(endToEndPct)}
                  tone={endToEndPct >= 1 ? "pos" : "warn"}
                />
              </>
            ) : (
              <Stat label="Conversões" value="— sem dados" tone="ink-3" />
            )}
          </div>

          {/* Funil */}
          <div className="card" style={{ padding: 32 }}>
            <div style={{ display: "grid", gap: 18 }}>
              {stages.map((s, i) => {
                const pct = topValue > 0 ? (s.value / topValue) * 100 : 0;
                const hasData = s.value > 0;
                const conv = s.conversion_from_prev;

                return (
                  <div key={s.key} style={{ display: "grid", gap: 6 }}>
                    {/* linha 1: índice + label + valor + delta */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto auto",
                        alignItems: "baseline",
                        gap: 10,
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: "var(--ink-4)",
                          width: 20,
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                      <span
                        style={{
                          fontSize: 11,
                          color: hasData && conv != null
                            ? conv >= 10 ? "var(--pos)" : conv >= 1 ? "var(--ink-3)" : "var(--warn)"
                            : "var(--ink-4)",
                          fontVariantNumeric: "tabular-nums",
                          minWidth: 80,
                          textAlign: "right",
                        }}
                      >
                        {hasData && conv != null ? `${fmtPctAdaptive(conv)} da anterior` : "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          color: hasData ? "var(--ink)" : "var(--ink-4)",
                          fontVariantNumeric: "tabular-nums",
                          minWidth: 110,
                          textAlign: "right",
                        }}
                      >
                        {hasData ? fmtInt(s.value) : "—"}
                      </span>
                    </div>

                    {/* barra */}
                    <div
                      style={{
                        position: "relative",
                        height: 20,
                        background: "var(--surface-2)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      {hasData && (
                        <div
                          style={{
                            width: `${Math.max(pct, 0.8)}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, var(--hero) 0%, color-mix(in oklch, var(--hero), var(--surface) 25%) 100%)`,
                            transition: "width 500ms ease",
                          }}
                        />
                      )}
                      {/* % do topo à direita fora da barra quando a barra é curta */}
                      {hasData && pct < 85 && (
                        <span
                          style={{
                            position: "absolute",
                            left: `calc(${Math.max(pct, 0.8)}% + 8px)`,
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: 10,
                            color: "var(--ink-4)",
                            fontVariantNumeric: "tabular-nums",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {pct.toFixed(1)}% do topo
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Outras ações registradas */}
      {otherEntries.length > 0 && (
        <div className="card" style={{ padding: 24, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Outras ações registradas</h2>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              {otherEntries.length} tipos · {fmtInt(totalOther)} eventos
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 6,
            }}
          >
            {otherEntries.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "var(--surface-2)",
                  borderRadius: 6,
                  fontSize: 12,
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  className="mono"
                  title={k}
                  style={{
                    color: "var(--ink-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                  }}
                >
                  {k}
                </span>
                <strong style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {fmtInt(v)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: tone ? `var(--${tone})` : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
