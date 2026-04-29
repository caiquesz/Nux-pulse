"use client";
import { useQuery } from "@tanstack/react-query";

import { type MetaOverview, type TrackcoreHealthIssue, trackcoreHealth } from "@/lib/api";

/**
 * Banner que detecta automaticamente discrepancias entre Meta Pixel + Trackcore.
 * Aparece SO quando ha problema; se tudo bate, fica invisivel.
 *
 * Combina duas fontes de diagnostico:
 *   1. Backend (`/integrations/clients/{slug}/trackcore/health`): analise
 *      profunda da tabela manual_conversions (deteccao de placeholders,
 *      vendas stale, configuracao quebrada, etc).
 *   2. Frontend heuristics (do MetaOverview): comparacao Pixel × Trackcore.
 *
 * O backend prevalece quando disponivel; frontend eh fallback quando o
 * endpoint nao retornou ou o cliente ainda nao foi analisado.
 */

type Issue = TrackcoreHealthIssue;

function frontendDiagnose(o: MetaOverview): Issue[] {
  const issues: Issue[] = [];
  const manual = o.manual_revenue ?? 0;
  const conversas = o.messages + o.leads;

  // Caso: Pixel reporta receita mas Trackcore zerado
  if (o.revenue > 100 && manual === 0 && o.spend > 50) {
    issues.push({
      code: "frontend_pixel_only",
      severity: "medium",
      title: "Pixel Meta detectou venda, Trackcore não",
      detail: `Receita atribuída pelo Pixel da Meta: R$ ${o.revenue.toFixed(2)}. Pelo Trackcore (mensagem chave): R$ 0,00. Vendedor pode estar esquecendo de enviar a mensagem chave após fechar venda.`,
      action: "Treinar time de vendas: toda venda fechada precisa da mensagem chave no WhatsApp pro Trackcore registrar.",
    });
  }

  // Caso: Trackcore captura mas eh fração do que o Pixel ve
  if (o.revenue > 1000 && manual > 0 && manual / o.revenue < 0.4) {
    const pct = ((manual / o.revenue) * 100).toFixed(0);
    issues.push({
      code: "frontend_trackcore_partial",
      severity: "medium",
      title: "Trackcore divergente do Pixel",
      detail: `Pixel reporta R$ ${o.revenue.toFixed(2)}. Trackcore só ${pct}% disso (R$ ${manual.toFixed(2)}). Algumas vendas estão escapando da detecção via mensagem chave.`,
      action: "Auditar vendas recentes — todas tiveram mensagem chave enviada pelo vendedor?",
    });
  }

  // Caso: tem volume + dinheiro mas ZERO vendas via Trackcore
  if (o.spend > 50 && (o.manual_purchases ?? 0) === 0 && conversas > 5) {
    issues.push({
      code: "frontend_no_sales",
      severity: "high",
      title: "Vendas Trackcore não estão chegando",
      detail: `Investimento de R$ ${o.spend.toFixed(2)} gerou ${conversas} conversas/leads no WhatsApp, mas zero vendas detectadas pelo Trackcore (via mensagem chave) no período.`,
      action: "Verificar config no Trackcore: cliente tem webhook de evento 'venda' habilitado apontando pro Pulse?",
    });
  }

  return issues;
}

function severityColor(sev: "high" | "medium" | "low") {
  if (sev === "high") return { color: "var(--neg)", bg: "var(--neg-fill)" };
  if (sev === "medium") return { color: "var(--warn)", bg: "var(--warn-fill)" };
  return { color: "var(--info)", bg: "var(--info-fill)" };
}

export function DataIntegrityBanner({
  data,
  clientSlug,
}: {
  data: MetaOverview | undefined;
  clientSlug?: string;
}) {
  // Backend deep analysis — tem prioridade quando disponivel
  const healthQ = useQuery({
    queryKey: ["trackcore-health", clientSlug],
    queryFn: () => trackcoreHealth(clientSlug!),
    enabled: !!clientSlug,
    staleTime: 60_000,  // 1 min cache
    retry: false,        // se endpoint falhar, cai pra frontend heuristics
  });

  // Decide qual conjunto de issues usar
  const issues: Issue[] = healthQ.data?.issues
    ?? (data ? frontendDiagnose(data) : []);

  if (issues.length === 0) return null;

  const worstSev = issues.some((i) => i.severity === "high") ? "high" : "medium";
  const tone = severityColor(worstSev);

  // Sub-titulo com contexto extra do backend
  const ctx = healthQ.data?.metrics;
  const ctxLine = ctx
    ? `${ctx.events_30d} eventos · ${ctx.purchases} venda${ctx.purchases !== 1 ? "s" : ""} · última: ${ctx.last_purchase_date ?? "nunca"}`
    : null;

  return (
    <div
      role="alert"
      style={{
        marginBottom: 24,
        padding: "16px 20px",
        background: `linear-gradient(180deg, ${tone.bg} 0%, transparent 100%)`,
        border: `1px solid ${tone.color}`,
        borderRadius: 14,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: tone.color,
          boxShadow: `0 0 12px ${tone.color}`,
        }} />
        <span className="mono" style={{
          fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
          fontWeight: 600, color: tone.color,
        }}>
          Verificação automática · {issues.length} {issues.length === 1 ? "alerta" : "alertas"}
        </span>
        {ctxLine && (
          <span className="mono" style={{
            fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.4,
            marginLeft: "auto",
          }}>
            {ctxLine}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {issues.map((i, idx) => {
          const itone = severityColor(i.severity);
          return (
            <div key={idx}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: "var(--ink)",
                marginBottom: 4,
              }}>
                {i.title}
              </div>
              <div style={{
                fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5,
                marginBottom: 6,
              }}>
                {i.detail}
              </div>
              <div style={{
                fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4,
                display: "flex", alignItems: "flex-start", gap: 6,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
                borderLeft: `2px solid ${itone.color}`,
              }}>
                <span style={{ color: itone.color, fontWeight: 600 }}>→</span>
                <span>{i.action}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
