"use client";
import type { MetaOverview } from "@/lib/api";

/**
 * Banner que detecta automaticamente discrepancias entre Meta Pixel + Trackcore.
 * Aparece SO quando ha problema; se tudo bate, fica invisivel.
 *
 * Heuristicas:
 *   - High: gasto + atividade WhatsApp mas zero vendas registradas
 *           (provavel: webhook de venda do Trackcore nao dispara)
 *   - Medium: Pixel reporta receita mas Trackcore nao captura
 *             (provavel: vendedor esquecendo mensagem chave)
 *   - Medium: Trackcore captura muito menos que Pixel
 *             (subset das vendas tem mensagem chave)
 */
type Issue = {
  severity: "high" | "medium";
  title: string;
  detail: string;
  action: string;
};

function diagnose(o: MetaOverview): Issue[] {
  const issues: Issue[] = [];
  const manual = o.manual_revenue ?? 0;
  const manualP = o.manual_purchases ?? 0;
  const conversas = o.messages + o.leads;

  // Caso 1: tem volume + dinheiro mas ZERO vendas via Trackcore
  if (o.spend > 50 && manualP === 0 && conversas > 5) {
    issues.push({
      severity: "high",
      title: "Vendas Trackcore não estão chegando",
      detail: `Investimento de R$ ${o.spend.toFixed(2)} gerou ${conversas} conversas/leads no WhatsApp, mas zero vendas foram detectadas pelo Trackcore (via mensagem chave) no período. O webhook de venda detectada provavelmente não está disparando.`,
      action: "Verificar config no Trackcore: cliente Comtex tem webhook de evento 'venda' habilitado apontando pro Pulse?",
    });
  }

  // Caso 2: Pixel detectou receita, Trackcore zerado
  if (o.revenue > 100 && manual === 0 && o.spend > 50) {
    issues.push({
      severity: "medium",
      title: "Pixel Meta detectou venda, Trackcore não",
      detail: `Receita atribuída pelo Pixel da Meta: R$ ${o.revenue.toFixed(2)}. Pelo Trackcore (mensagem chave): R$ 0,00. Vendedor pode estar esquecendo de enviar a mensagem chave após fechar venda.`,
      action: "Treinar time de vendas: toda venda fechada precisa da mensagem chave no WhatsApp pro Trackcore registrar.",
    });
  }

  // Caso 3: Trackcore captura mas eh fração do que o Pixel ve
  if (o.revenue > 1000 && manual > 0 && manual / o.revenue < 0.4) {
    const pct = ((manual / o.revenue) * 100).toFixed(0);
    issues.push({
      severity: "medium",
      title: "Trackcore divergente do Pixel",
      detail: `Pixel reporta R$ ${o.revenue.toFixed(2)}. Trackcore só ${pct}% disso (R$ ${manual.toFixed(2)}). Algumas vendas estão escapando da detecção via mensagem chave.`,
      action: "Auditar vendas recentes — todas tiveram mensagem chave enviada pelo vendedor?",
    });
  }

  return issues;
}

export function DataIntegrityBanner({ data }: { data: MetaOverview | undefined }) {
  if (!data) return null;
  const issues = diagnose(data);
  if (issues.length === 0) return null;

  const worst = issues.some((i) => i.severity === "high") ? "high" : "medium";
  const tone = worst === "high"
    ? { color: "var(--neg)", bg: "var(--neg-fill)", border: "var(--neg)" }
    : { color: "var(--warn)", bg: "var(--warn-fill)", border: "var(--warn)" };

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
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
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {issues.map((i, idx) => (
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
              borderLeft: `2px solid ${tone.color}`,
            }}>
              <span style={{ color: tone.color, fontWeight: 600 }}>→</span>
              <span>{i.action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
