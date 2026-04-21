"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { differenceInDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { BigChart } from "@/components/primitives/BigChart";
import { Delta } from "@/components/primitives/Delta";
import { PlatChip } from "@/components/primitives/PlatChip";
import { Sparkline } from "@/components/primitives/Sparkline";
import { Icon } from "@/components/icons/Icon";
import { DateRangePicker } from "@/components/DateRangePicker";
import {
  listJobs,
  metaOverview, metaCampaigns, metaDaily,
  triggerMetaBackfill,
  type MetaOverview, type MetaCampaignsResponse, type MetaDailyResponse,
  type RangeOpts,
} from "@/lib/api";
import { fmtBRL, fmtInt, fmtIntCompact, fmtPct } from "@/lib/fmt";

const PERIODS = [
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

export function Overview() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [periodKey, setPeriodKey] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState<DateRange | undefined>(undefined);

  // Se tem range custom, usa ele; senão, usa o preset
  const rangeOpts: RangeOpts = useMemo(() => {
    if (custom?.from && custom?.to) {
      return {
        since: format(custom.from, "yyyy-MM-dd"),
        until: format(custom.to, "yyyy-MM-dd"),
      };
    }
    return { days: PERIODS.find((p) => p.key === periodKey)!.days };
  }, [custom, periodKey]);

  const days =
    custom?.from && custom?.to
      ? differenceInDays(custom.to, custom.from) + 1
      : PERIODS.find((p) => p.key === periodKey)!.days;

  const queryKeyBase = [slug, rangeOpts.since ?? "d", rangeOpts.until ?? rangeOpts.days];

  const overviewQ = useQuery<MetaOverview>({
    queryKey: ["meta", "overview", ...queryKeyBase],
    queryFn: () => metaOverview(slug, rangeOpts),
    enabled: !!slug,
  });

  // Sync status + trigger
  const qc = useQueryClient();
  const jobsQ = useQuery({
    queryKey: ["sync-jobs", slug],
    queryFn: () => listJobs(slug, 1),
    enabled: !!slug,
    refetchInterval: (q) => (q.state.data?.[0]?.status === "running" ? 3000 : false),
  });
  const running = jobsQ.data?.[0]?.status === "running";
  const backfillMut = useMutation({
    mutationFn: () => triggerMetaBackfill(slug, { days, level: "ad" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", slug] });
      // quando o job terminar, o refetchInterval para e o polling reflete no status.
      // Após done, revalida métricas:
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["meta"] });
      }, 5000);
    },
  });
  const campaignsQ = useQuery<MetaCampaignsResponse>({
    queryKey: ["meta", "campaigns", ...queryKeyBase],
    queryFn: () => metaCampaigns(slug, rangeOpts),
    enabled: !!slug,
  });
  const dailyQ = useQuery<MetaDailyResponse>({
    queryKey: ["meta", "daily", ...queryKeyBase],
    queryFn: () => metaDaily(slug, rangeOpts),
    enabled: !!slug,
  });

  const kpis = useMemo(() => buildKpis(overviewQ.data, dailyQ.data), [overviewQ.data, dailyQ.data]);
  const series = useMemo(() => (dailyQ.data?.series ?? []).map((p) => p.spend), [dailyQ.data]);
  // Labels curtos "dd/mm" pra cada ponto — usados no tooltip dos sparklines.
  const dateLabels = useMemo(
    () =>
      (dailyQ.data?.series ?? []).map((p) => {
        const [, mm, dd] = p.date.split("-");
        return `${dd}/${mm}`;
      }),
    [dailyQ.data],
  );

  // Escolhe a melhor métrica de conversão pra overlay no gráfico.
  // Prioridade: compras > leads > mensagens. Se nada, não mostra.
  const overlay = useMemo(() => {
    const rows = dailyQ.data?.series ?? [];
    const totalPurchases = rows.reduce((s, p) => s + (p.purchases || 0), 0);
    const totalLeads = rows.reduce((s, p) => s + (p.leads || 0), 0);
    const totalMsgs = rows.reduce((s, p) => s + (p.messages || 0), 0);
    if (totalPurchases > 0) return { label: "Compras", values: rows.map((p) => p.purchases) };
    if (totalLeads > 0) return { label: "Leads", values: rows.map((p) => p.leads) };
    if (totalMsgs > 0) return { label: "Mensagens", values: rows.map((p) => p.messages) };
    return null;
  }, [dailyQ.data]);

  const loading = overviewQ.isLoading || campaignsQ.isLoading || dailyQ.isLoading;
  const error = overviewQ.error || campaignsQ.error || dailyQ.error;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">01 — VISÃO GERAL</div>
          <h1>Overview · Meta Ads</h1>
          <div className="sub">
            {loading ? "Carregando…" : `Últimos ${days} dias · ${campaignsQ.data?.campaigns.length ?? 0} campanhas`}
          </div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={!custom && periodKey === p.key ? "on" : ""}
                onClick={() => {
                  setCustom(undefined);
                  setPeriodKey(p.key);
                }}
              >
                {p.key.toUpperCase()}
              </button>
            ))}
          </div>
          <DateRangePicker value={custom} onChange={setCustom} />
          <button
            className="btn ghost"
            onClick={() => backfillMut.mutate()}
            disabled={running || backfillMut.isPending}
            title={running ? "Sincronização em andamento…" : `Sincronizar últimos ${days} dias da Meta`}
          >
            <Icon name="refresh" size={12} />
            {running ? "Sincronizando…" : backfillMut.isPending ? "Enviando…" : "Sincronizar"}
          </button>
          <button className="btn ghost">
            <Icon name="export" size={12} />
            Exportar
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--neg)", marginBottom: 24 }}>
          <div className="stat">
            <span className="stat-label" style={{ color: "var(--neg)" }}>Erro ao carregar</span>
            <span style={{ fontSize: 13 }}>{String((error as Error).message)}</span>
          </div>
        </div>
      )}

      <div className="sec-head">
        <span className="num">SEÇÃO 01</span>
        <h3>Resultado do período</h3>
        <span className="hint">Métricas consolidadas Meta Ads</span>
        <div className="rule" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))", marginBottom: 28 }}>
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className="stat">
              <span className="stat-label">{k.label}</span>
              <span className="stat-value">{loading ? "—" : k.value}</span>
              <div className="stat-delta">
                <span className="dim">vs. período ant.</span>
              </div>
              {k.series.length > 1 && (
                <div className="stat-spark">
                  <Sparkline
                    series={k.series}
                    labels={dateLabels}
                    format={k.format}
                    height={36}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sec-head">
        <span className="num">SEÇÃO 02</span>
        <h3>Evolução diária — Investimento</h3>
        <div className="rule" />
      </div>

      <div className="hero-banner accent-lime" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, position: "relative", zIndex: 1 }}>
          <div>
            <div className="hb-label">INVESTIMENTO · {days} DIAS</div>
            <div className="hb-value">
              {overviewQ.data ? fmtBRL(overviewQ.data.spend) : "R$ 0,00"}
            </div>
            <div className="hb-sub">
              {series.length > 1
                ? `Variação diária nos últimos ${days} dias`
                : "Os insights diários aparecem aqui após o próximo backfill"}
            </div>
          </div>
          <span className="tag lime mono">● LIVE · META ADS</span>
        </div>

        {/* Legenda explícita: o gráfico tem 2 linhas em escalas diferentes */}
        {series.length > 1 && (
          <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(234,231,223,0.75)", letterSpacing: 0.3, position: "relative", zIndex: 1 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--lime)", borderRadius: 1 }} />
              Investimento (R$/dia)
            </span>
            {overlay && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 14, height: 2,
                  background: "repeating-linear-gradient(90deg, var(--citrus) 0 4px, transparent 4px 7px)",
                }} />
                {overlay.label} (passa o mouse pra ver o nº)
              </span>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, position: "relative", zIndex: 1 }}>
          {series.length > 1 ? (
            <BigChart
              series={series}
              compare={overlay?.values}
              labels={dateLabels}
              seriesLabel="Investimento"
              seriesFormat={(v) => fmtBRL(v)}
              compareLabel={overlay?.label}
              compareFormat={(v) => Math.round(v).toLocaleString("pt-BR")}
              height={220}
              lineColor="var(--lime)"
              fillColor="oklch(0.90 0.22 125 / 0.18)"
              compareColor="var(--citrus)"
              axisColor="rgba(234,231,223,0.45)"
              gridColor="rgba(234,231,223,0.08)"
            />
          ) : (
            <div style={{
              height: 220, display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(234,231,223,0.4)", fontSize: 12, fontFamily: "var(--font-mono)",
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              aguardando dados diários
            </div>
          )}
        </div>
      </div>

      <div className="sec-head">
        <span className="num">SEÇÃO 03</span>
        <h3>Campanhas</h3>
        <span className="hint">
          {campaignsQ.data ? `${campaignsQ.data.campaigns.length} campanhas · Meta Ads` : "—"}
        </span>
        <div className="rule" />
      </div>

      <div className="card tight">
        {loading && !campaignsQ.data ? (
          <div style={{ padding: 32, color: "var(--ink-3)", fontSize: 13 }}>Carregando campanhas…</div>
        ) : !campaignsQ.data || campaignsQ.data.campaigns.length === 0 ? (
          <EmptyState
            title="Nenhuma campanha ingerida ainda"
            body="Rode: docker compose exec api python -m scripts.backfill --slug segredos-de-minas --days 7 --level campaign"
          />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Plataforma</th>
                <th>Campanha</th>
                <th className="num">Budget/dia</th>
                <th className="num">Investido</th>
                <th className="num">Impressões</th>
                <th className="num">Cliques</th>
                <th className="num">CTR</th>
                <th className="num">CPC</th>
              </tr>
            </thead>
            <tbody>
              {campaignsQ.data.campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`dot ${statusDot(c.effective_status)}`} />
                  </td>
                  <td><PlatChip plat="meta" /></td>
                  <td><span className="prim">{c.name}</span></td>
                  <td className="num mono">{c.daily_budget ? fmtBRL(c.daily_budget, { compact: true }) : "—"}</td>
                  <td className="num">{c.spend ? fmtBRL(c.spend) : "—"}</td>
                  <td className="num">{c.impressions ? fmtIntCompact(c.impressions) : "—"}</td>
                  <td className="num">{c.clicks ? fmtInt(c.clicks) : "—"}</td>
                  <td className="num">{c.ctr ? fmtPct(c.ctr) : "—"}</td>
                  <td className="num">{c.cpc ? fmtBRL(c.cpc) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────
type Kpi = {
  label: string;
  value: string;
  unit: string;
  delta: number;
  series: number[];
  format: (v: number) => string;
};

function buildKpis(o: MetaOverview | undefined, daily?: MetaDailyResponse): Kpi[] {
  const emptySeries: number[] = [];
  const noFmt = (v: number) => v.toLocaleString("pt-BR");
  if (!o) {
    return [
      { label: "Investimento", value: "—", unit: "BRL", delta: 0, series: emptySeries, format: fmtBRL },
      { label: "Mensagens", value: "—", unit: "", delta: 0, series: emptySeries, format: noFmt },
      { label: "Leads", value: "—", unit: "", delta: 0, series: emptySeries, format: noFmt },
      { label: "Compras", value: "—", unit: "", delta: 0, series: emptySeries, format: noFmt },
      { label: "ROAS", value: "—", unit: "x", delta: 0, series: emptySeries, format: (v) => v.toFixed(2) + "x" },
      { label: "Impressões", value: "—", unit: "", delta: 0, series: emptySeries, format: noFmt },
      { label: "Cliques", value: "—", unit: "", delta: 0, series: emptySeries, format: noFmt },
      { label: "CTR", value: "—", unit: "%", delta: 0, series: emptySeries, format: (v) => fmtPct(v) },
    ];
  }

  const series = daily?.series ?? [];
  const spendSeries = series.map((p) => p.spend);
  const msgSeries = series.map((p) => p.messages);
  const leadSeries = series.map((p) => p.leads);
  const purchaseSeries = series.map((p) => p.purchases);
  const impSeries = series.map((p) => p.impressions);
  const clkSeries = series.map((p) => p.clicks);
  // ROAS diário = revenue/spend por dia. Só mostra se há receita agregada;
  // do contrário, série vazia (esconde sparkline — não finge dado que não existe).
  const totalRevenue = series.reduce((s, p) => s + (p.revenue || 0), 0);
  const roasSeries: number[] = totalRevenue > 0
    ? series.map((p) => (p.spend > 0 ? (p.revenue || 0) / p.spend : 0))
    : [];
  // CTR diário real (clicks/impressions * 100), não usa impSeries como proxy.
  const ctrSeries = series.map((p) => (p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0));

  const d = o.deltas;
  const roasLabel = o.roas > 0 ? `${o.roas.toFixed(2)}x` : "—";

  return [
    {
      label: "Investimento",
      value: fmtBRL(o.spend),
      unit: "BRL",
      delta: d.spend ?? 0,
      series: spendSeries,
      format: fmtBRL,
    },
    {
      label: o.messages > 0 ? `Mensagens · R$${o.cost_per_message.toFixed(2)}/msg` : "Mensagens",
      value: fmtIntCompact(o.messages),
      unit: "",
      delta: d.messages ?? 0,
      series: msgSeries,
      format: (v) => fmtIntCompact(Math.round(v)),
    },
    {
      label: o.leads > 0 ? `Leads · R$${o.cost_per_lead.toFixed(2)}/lead` : "Leads",
      value: fmtIntCompact(o.leads),
      unit: "",
      delta: d.leads ?? 0,
      series: leadSeries,
      format: (v) => Math.round(v).toLocaleString("pt-BR"),
    },
    {
      label: o.purchases > 0 ? `Compras · R$${o.cost_per_purchase.toFixed(2)}/compra` : "Compras",
      value: fmtIntCompact(o.purchases),
      unit: "",
      delta: d.purchases ?? 0,
      series: purchaseSeries,
      format: (v) => Math.round(v).toLocaleString("pt-BR"),
    },
    {
      label: o.revenue > 0 ? `ROAS · ${fmtBRL(o.revenue)} receita` : "ROAS",
      value: roasLabel,
      unit: "x",
      delta: d.roas ?? 0,
      series: roasSeries, // vazio quando não há receita → sparkline escondido
      format: (v) => v.toFixed(2) + "x",
    },
    {
      label: "Impressões",
      value: fmtIntCompact(o.impressions),
      unit: "",
      delta: d.impressions ?? 0,
      series: impSeries,
      format: (v) => fmtIntCompact(Math.round(v)),
    },
    {
      label: "Cliques",
      value: fmtIntCompact(o.clicks),
      unit: "",
      delta: d.clicks ?? 0,
      series: clkSeries,
      format: (v) => fmtIntCompact(Math.round(v)),
    },
    {
      label: "CTR",
      value: fmtPct(o.ctr),
      unit: "%",
      delta: d.ctr ?? 0,
      series: ctrSeries,
      format: (v) => fmtPct(v),
    },
  ];
}

function statusDot(s: string | null): "on" | "warn" | "off" {
  if (!s) return "off";
  const up = s.toUpperCase();
  if (up === "ACTIVE") return "on";
  if (up === "PAUSED" || up === "CAMPAIGN_PAUSED" || up === "ADSET_PAUSED") return "off";
  return "warn";
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      padding: "40px 24px", textAlign: "center", color: "var(--ink-3)",
      display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)" }}>{title}</div>
      <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-4)", maxWidth: 560 }}>
        {body}
      </div>
    </div>
  );
}
