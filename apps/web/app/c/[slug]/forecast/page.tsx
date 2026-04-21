"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { getClient, metaDaily } from "@/lib/api";
import { fmtBRL, fmtInt } from "@/lib/fmt";

export default function ForecastPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const client = useQuery({ queryKey: ["client", slug], queryFn: () => getClient(slug), enabled: !!slug });
  // usa 30 dias de histórico pra calcular o ritmo
  const daily = useQuery({
    queryKey: ["forecast-daily", slug, 30],
    queryFn: () => metaDaily(slug, { days: 30 }),
    enabled: !!slug,
  });

  const stats = useMemo(() => {
    const series = daily.data?.series ?? [];
    const withSpend = series.filter((s) => s.spend > 0);
    const n = withSpend.length;
    if (n === 0) return null;

    const totalSpend = withSpend.reduce((s, r) => s + r.spend, 0);
    const totalClicks = withSpend.reduce((s, r) => s + r.clicks, 0);
    const avgDaily = totalSpend / n;
    const avgClicks = totalClicks / n;

    // tendência via regressão linear simples (slope do spend diário sobre o índice)
    const idx = Array.from({ length: n }, (_, i) => i);
    const meanX = idx.reduce((a, b) => a + b, 0) / n;
    const meanY = avgDaily;
    const num = idx.reduce((a, x, i) => a + (x - meanX) * (withSpend[i].spend - meanY), 0);
    const den = idx.reduce((a, x) => a + (x - meanX) ** 2, 0) || 1;
    const slope = num / den;
    const trendDir = slope > avgDaily * 0.01 ? "up" : slope < -avgDaily * 0.01 ? "down" : "flat";

    // Projeções 7d / 30d (simples: média × período com ajuste leve da tendência)
    const project = (days: number) => {
      const withTrend = avgDaily + slope * (n / 2 + days / 2); // aproximação
      return Math.max(0, Math.min(withTrend, avgDaily * 3)) * days;
    };

    // Fim do mês corrente
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeftMonth = Math.max(0, lastDay - now.getDate());

    return {
      avgDaily,
      avgClicks,
      slope,
      trendDir,
      project7d: project(7),
      project30d: project(30),
      projectMonthEnd: project(daysLeftMonth),
      daysLeftMonth,
      sampleDays: n,
    };
  }, [daily.data]);

  const monthlyBudget = Number(client.data?.monthly_budget ?? 0);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedInMonth = now.getDate();
  const monthExpectedSoFar = monthlyBudget * (elapsedInMonth / daysInMonth);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">11 — FORECAST</div>
          <h1>Projeção</h1>
          <div className="sub">
            {stats
              ? `Baseado em ${stats.sampleDays} dia(s) com gasto nos últimos 30d`
              : "Sem histórico suficiente ainda"}
          </div>
        </div>
      </div>

      {!stats && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          Rode um Sincronizar de 30 dias antes. Sem dados históricos não dá pra projetar.
        </div>
      )}

      {stats && (
        <>
          <div className="card" style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 16 }}>
            <Stat label="Gasto médio / dia" value={fmtBRL(stats.avgDaily)} />
            <Stat label="Cliques médios / dia" value={fmtInt(Math.round(stats.avgClicks))} />
            <Stat
              label="Tendência"
              value={stats.trendDir === "up" ? "↑ em alta" : stats.trendDir === "down" ? "↓ em queda" : "→ estável"}
              tone={stats.trendDir === "up" ? "pos" : stats.trendDir === "down" ? "neg" : "ink-2"}
            />
          </div>

          <div className="card" style={{ padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Projeção de gasto</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <ProjectionRow label="Próximos 7 dias" value={stats.project7d} />
              <ProjectionRow label="Próximos 30 dias" value={stats.project30d} />
              <ProjectionRow label={`Até o fim do mês (${stats.daysLeftMonth} dias restantes)`} value={stats.projectMonthEnd} />
            </div>
          </div>

          {monthlyBudget > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Vs. budget mensal do cliente</h3>
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <Row label="Budget mensal" value={fmtBRL(monthlyBudget)} />
                <Row label={`Esperado até hoje (${elapsedInMonth}/${daysInMonth})`} value={fmtBRL(monthExpectedSoFar)} />
                <Row label="Projeção final do mês" value={fmtBRL(stats.avgDaily * daysInMonth)} tone={stats.avgDaily * daysInMonth > monthlyBudget * 1.1 ? "neg" : "pos"} />
              </div>
            </div>
          )}

          <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 16, lineHeight: 1.5 }}>
            Modelo: regressão linear simples sobre os últimos {stats.sampleDays} dias com gasto.
            Projeção clipada a 3× a média p/ evitar saltos absurdos. Não considera sazonalidade nem eventos.
          </p>
        </>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4, color: tone ? `var(--${tone})` : undefined }}>
        {value}
      </div>
    </div>
  );
}

function ProjectionRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: 15 }}>{fmtBRL(value)}</strong>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <strong style={{ fontVariantNumeric: "tabular-nums", color: tone ? `var(--${tone})` : undefined }}>{value}</strong>
    </div>
  );
}
