"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { metaAlerts } from "@/lib/api";
import { POLL_MS } from "@/lib/useAutoSync";

const KIND_LABELS: Record<string, string> = {
  fatigue: "Fadiga criativa",
  cpc_spike: "CPC disparou",
  underpace: "Gasto abaixo do esperado",
  no_spend: "Sem gasto recente",
};

export default function AlertsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const q = useQuery({
    queryKey: ["meta-alerts", slug],
    queryFn: () => metaAlerts(slug),
    enabled: !!slug,
    refetchInterval: POLL_MS,
  });

  const alerts = q.data?.alerts ?? [];
  const counts = alerts.reduce(
    (acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">10 — ALERTAS</div>
          <h1>Alertas & anomalias</h1>
          <div className="sub">
            {q.isLoading
              ? "Analisando últimas 2 semanas…"
              : alerts.length === 0
              ? "Tudo sob controle ✓"
              : `${alerts.length} alerta(s) · ${counts.neg ?? 0} crítico · ${counts.warn ?? 0} atenção`}
          </div>
        </div>
      </div>

      {!q.isLoading && alerts.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, color: "var(--ink-3)" }}>
            Nenhum alerta no momento. Campanhas rodando dentro do esperado.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {alerts.map((a, i) => {
          const sev = a.severity === "neg" ? "var(--neg)" : a.severity === "warn" ? "var(--warn)" : "var(--info)";
          const bg = a.severity === "neg" ? "var(--neg-bg)" : a.severity === "warn" ? "var(--warn-bg)" : "var(--info-bg)";
          return (
            <div
              key={i}
              className="card"
              style={{ padding: 16, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "center" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: sev, fontSize: 16, fontWeight: 700 }}>
                !
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                  {KIND_LABELS[a.kind] ?? a.kind}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                  {a.campaign_name}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{a.message}</div>
              </div>
              <span className="tag" style={{ background: bg, color: sev }}>
                {a.severity === "neg" ? "crítico" : a.severity === "warn" ? "atenção" : "info"}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 16 }}>
        Regras: CTR cai &gt;30% (fadiga) · CPC dobra (spike) · gasto &lt;50% do budget 7d (underpace) · campanha ATIVA sem gasto 3d (no_spend). Atualiza a cada minuto.
      </p>
    </>
  );
}
