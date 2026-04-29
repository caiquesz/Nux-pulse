"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { differenceInDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { BigChart } from "@/components/primitives/BigChart";
import { DataIntegrityBanner } from "@/components/DataIntegrityBanner";
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
  // Periodo de comparacao customizavel. Quando setado, sobrepoe o
  // previous_period default do backend e busca metricas no range escolhido.
  const [customCompare, setCustomCompare] = useState<DateRange | undefined>(undefined);

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

  // Compare period customizado — busca metricas no range escolhido pra usar
  // como "previous" em vez do previous_period default. So roda quando o
  // user setou ambos os limites (from + to).
  const customCompareOpts: RangeOpts | null = useMemo(() => {
    if (customCompare?.from && customCompare?.to) {
      return {
        since: format(customCompare.from, "yyyy-MM-dd"),
        until: format(customCompare.to, "yyyy-MM-dd"),
      };
    }
    return null;
  }, [customCompare]);

  const compareQ = useQuery<MetaOverview>({
    queryKey: ["meta", "overview-compare", slug, customCompareOpts?.since, customCompareOpts?.until],
    queryFn: () => metaOverview(slug, customCompareOpts!),
    enabled: !!slug && !!customCompareOpts,
  });

  // Daily series do periodo de comparacao — usado pra sparkline roxo nos
  // compare cards. Quando custom esta setado, busca pra esse range; senao
  // usa o range default do previous_period (do overview).
  const compareDailyOpts: RangeOpts | null = useMemo(() => {
    if (customCompareOpts) return customCompareOpts;
    const pp = overviewQ.data?.previous_period;
    if (pp) return { since: pp.since, until: pp.until };
    return null;
  }, [customCompareOpts, overviewQ.data]);

  const compareDailyQ = useQuery<MetaDailyResponse>({
    queryKey: ["meta", "daily-compare", slug, compareDailyOpts?.since, compareDailyOpts?.until],
    queryFn: () => metaDaily(slug, compareDailyOpts!),
    enabled: !!slug && !!compareDailyOpts,
  });

  const kpis = useMemo(
    () => buildKpis(overviewQ.data, dailyQ.data, compareQ.data, compareDailyQ.data),
    [overviewQ.data, dailyQ.data, compareQ.data, compareDailyQ.data],
  );

  // Date labels pra sparkline do compare period (formato dd/mm).
  const compareDateLabels = useMemo(
    () =>
      (compareDailyQ.data?.series ?? []).map((p) => {
        const [, mm, dd] = p.date.split("-");
        return `${dd}/${mm}`;
      }),
    [compareDailyQ.data],
  );
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

  // Multi-line chart overlays: cada metrica conversiva ganha sua propria linha
  // SOLIDA com cor distinta (paleta de dados, nao bate com accent do sistema).
  // Inclui apenas series com pelo menos 1 ponto > 0 — series totalmente zeradas
  // sao filtradas pra evitar linhas planas no rodape.
  const extras = useMemo(() => {
    const rows = dailyQ.data?.series ?? [];
    if (rows.length === 0) return [];
    const out: { values: number[]; label: string; color: string }[] = [];

    const totalMsgs = rows.reduce((s, p) => s + (p.messages || 0), 0);
    if (totalMsgs > 0) {
      out.push({
        values: rows.map((p) => p.messages),
        label: "Conversas iniciadas",
        color: "var(--data-cyan)",
      });
    }

    const totalLeads = rows.reduce((s, p) => s + (p.leads || 0), 0);
    if (totalLeads > 0) {
      out.push({
        values: rows.map((p) => p.leads),
        label: "Leads",
        color: "var(--data-violet)",
      });
    }

    const totalPurchases = rows.reduce((s, p) => s + (p.purchases || 0), 0);
    if (totalPurchases > 0) {
      out.push({
        values: rows.map((p) => p.purchases),
        label: "Vendas",
        color: "var(--data-lime)",
      });
    }

    return out;
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

      {/* Auto-detecta divergencia Trackcore × Pixel × atividade.
          Renderiza so quando ha problema; nao polui a tela quando dados batem.
          Quando endpoint backend retorna, usa analise profunda; senao frontend. */}
      <DataIntegrityBanner data={overviewQ.data} clientSlug={slug} />

      <div className="sec-head">
        <span className="num">SEÇÃO 01 · PERÍODO DE ANÁLISE</span>
        <h3>Resultado do período</h3>
        <span className="hint">
          {overviewQ.data
            ? `${formatRangeBr(overviewQ.data.since, overviewQ.data.until)} · Meta Ads`
            : "Métricas consolidadas Meta Ads"}
        </span>
        <div className="rule" />
      </div>

      <div className="grid-kpi" style={{ marginBottom: 36 }}>
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className="stat">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <span className="stat-label">{k.label}</span>
                {!loading && <DeltaChip delta={k.delta} semantic={k.deltaSemantic} />}
              </div>
              <span className="stat-value">{loading ? "—" : k.value}</span>
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

      {/* SEÇÃO 02 — Período de comparação (anterior).
          Grid espelha layout da seção 01 mas em treatment muted: cards menores,
          sem sparkline, opacity 80%, valor em peso intermediario. Permite scan
          rapido visual: cada card "atual" tem seu twin embaixo, alinhado pela
          mesma coluna do grid. */}
      {overviewQ.data && (
        <>
          <div className="sec-head">
            <span className="num">SEÇÃO 02 · COMPARAÇÃO</span>
            <h3>{customCompare?.from && customCompare?.to ? "Período personalizado" : "Período anterior"}</h3>
            <span className="hint">
              {compareQ.data
                ? formatRangeBr(compareQ.data.since, compareQ.data.until)
                : formatRangeBr(overviewQ.data.previous_period.since, overviewQ.data.previous_period.until)}
            </span>
            <div className="rule" />
            <DateRangePicker
              value={customCompare}
              onChange={setCustomCompare}
            />
            {customCompare && (
              <button
                className="btn ghost"
                onClick={() => setCustomCompare(undefined)}
                style={{ padding: "6px 12px", fontSize: 11, minHeight: 30 }}
                title="Voltar pro período anterior padrão"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="grid-kpi grid-kpi-prev" style={{ marginBottom: 28 }}>
            {kpis.map((k) => (
              <div key={k.label} className="card card-prev">
                <div className="stat">
                  <span className="stat-label">{k.label}</span>
                  <span className="stat-value stat-value-prev">
                    {compareQ.isLoading || compareDailyQ.isLoading ? "—" : k.prevValue}
                  </span>
                  {k.prevSeries.length > 1 && (
                    <div className="stat-spark">
                      <Sparkline
                        series={k.prevSeries}
                        labels={compareDateLabels}
                        format={k.format}
                        height={36}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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

        {/* Legenda — uma entrada por linha. Cores da paleta de dados (data-orange,
            data-cyan, data-lime, data-violet) — solidas, sem tracejado. */}
        {series.length > 1 && (
          <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap", fontSize: 11, fontFamily: "var(--font-sans)", color: "rgba(255,255,255,0.7)", letterSpacing: 0.2, position: "relative", zIndex: 1 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 16, height: 2, background: "var(--data-orange)", borderRadius: 1 }} />
              Investimento (R$/dia)
            </span>
            {extras.map((e) => (
              <span key={e.label} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 16, height: 2, background: e.color, borderRadius: 1 }} />
                {e.label}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, position: "relative", zIndex: 1 }}>
          {series.length > 1 ? (
            <BigChart
              series={series}
              extras={extras}
              labels={dateLabels}
              seriesLabel="Investimento"
              seriesFormat={(v) => fmtBRL(v)}
              height={240}
              lineColor="var(--data-orange)"
              axisColor="rgba(255,255,255,0.45)"
              gridColor="rgba(255,255,255,0.06)"
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
type DeltaSemantic = "up_better" | "up_worse" | "neutral";

type Kpi = {
  label: string;
  value: string;
  /** Valor do periodo de comparacao formatado (mesmo formato que value). */
  prevValue: string;
  /** Serie diaria do periodo de comparacao (pra sparkline roxo nos compare cards). */
  prevSeries: number[];
  unit: string;
  /** Ratio: 0.12 = +12% (positivo). Null quando previous era 0 ou indefinido. */
  delta: number | null;
  /** Define cor do delta chip:
   *  up_better: aumentar eh bom (revenue, vendas, ROAS) -> verde quando >0
   *  up_worse:  aumentar eh ruim (CPL, CPA) -> vermelho quando >0
   *  neutral:   ambiguo (investimento, impressoes) -> cinza */
  deltaSemantic: DeltaSemantic;
  series: number[];
  format: (v: number) => string;
};

function buildKpis(
  o: MetaOverview | undefined,
  daily?: MetaDailyResponse,
  /** Quando presente, substitui o.previous_period (period customizavel pelo user). */
  compareOverride?: MetaOverview,
  /** Daily series do periodo de comparacao — alimenta prevSeries pra sparklines. */
  compareDaily?: MetaDailyResponse,
): Kpi[] {
  const emptySeries: number[] = [];
  const noFmt = (v: number) => v.toLocaleString("pt-BR");
  const dash = "—";
  if (!o) {
    return [
      { label: "Investimento", value: dash, prevValue: dash, prevSeries: emptySeries, unit: "BRL", delta: null, deltaSemantic: "neutral", series: emptySeries, format: fmtBRL },
      { label: "Mensagens",    value: dash, prevValue: dash, prevSeries: emptySeries, unit: "",    delta: null, deltaSemantic: "up_better", series: emptySeries, format: noFmt },
      { label: "Leads",        value: dash, prevValue: dash, prevSeries: emptySeries, unit: "",    delta: null, deltaSemantic: "up_better", series: emptySeries, format: noFmt },
      { label: "Vendas",       value: dash, prevValue: dash, prevSeries: emptySeries, unit: "",    delta: null, deltaSemantic: "up_better", series: emptySeries, format: noFmt },
      { label: "Faturamento",  value: dash, prevValue: dash, prevSeries: emptySeries, unit: "BRL", delta: null, deltaSemantic: "up_better", series: emptySeries, format: fmtBRL },
      { label: "ROAS",         value: dash, prevValue: dash, prevSeries: emptySeries, unit: "x",   delta: null, deltaSemantic: "up_better", series: emptySeries, format: (v) => v.toFixed(2) + "x" },
      { label: "Impressões",   value: dash, prevValue: dash, prevSeries: emptySeries, unit: "",    delta: null, deltaSemantic: "up_better", series: emptySeries, format: noFmt },
      { label: "Cliques",      value: dash, prevValue: dash, prevSeries: emptySeries, unit: "",    delta: null, deltaSemantic: "up_better", series: emptySeries, format: noFmt },
      { label: "CTR",          value: dash, prevValue: dash, prevSeries: emptySeries, unit: "%",   delta: null, deltaSemantic: "up_better", series: emptySeries, format: (v) => fmtPct(v) },
    ];
  }

  const series = daily?.series ?? [];
  const spendSeries = series.map((p) => p.spend);
  const msgSeries = series.map((p) => p.messages);
  const leadSeries = series.map((p) => p.leads);
  const purchaseSeries = series.map((p) => p.purchases);
  const impSeries = series.map((p) => p.impressions);
  const clkSeries = series.map((p) => p.clicks);
  // prev* series — sparkline do compare card (linha roxa). Vazio quando
  // compareDaily nao disponivel; sparkline nao renderiza nesse caso.
  const prevRows = compareDaily?.series ?? [];
  const prevSpendSeries = prevRows.map((p) => p.spend);
  const prevMsgSeries = prevRows.map((p) => p.messages);
  const prevLeadSeries = prevRows.map((p) => p.leads);
  const prevPurchaseSeries = prevRows.map((p) => p.purchases);
  const prevImpSeries = prevRows.map((p) => p.impressions);
  const prevClkSeries = prevRows.map((p) => p.clicks);
  const prevTotalRevenueAgg = prevRows.reduce((s, p) => s + (p.revenue || 0), 0);
  const prevRevenueSeries: number[] = prevTotalRevenueAgg > 0 ? prevRows.map((p) => p.revenue || 0) : [];
  const prevRoasSeries: number[] = prevTotalRevenueAgg > 0
    ? prevRows.map((p) => (p.spend > 0 ? (p.revenue || 0) / p.spend : 0))
    : [];
  const prevCtrSeries = prevRows.map((p) => (p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0));
  // Selecao inteligente da fonte de Faturamento/Vendas.
  //
  // Trackcore eh GROUND TRUTH quando funciona (mensagem chave detecta venda
  // real com valor real). Mas as vezes esta under-reporting:
  //   - vendedor esquece a mensagem chave
  //   - webhook nao dispara pra todos os tipos
  //   - configuracao diferente por cliente
  //
  // Em vez de cegar no Trackcore, comparamos com Pixel e usamos a fonte mais
  // razoavel:
  //   - Trackcore >= 40% da receita do Pixel: confiavel, usa Trackcore
  //   - Trackcore < 40% e Pixel > 100: Pixel mais confiavel (Trackcore capta
  //     fracao das vendas — banner explica e sugere acao)
  //   - Pixel zero e Trackcore zero: nada a mostrar
  const trackcoreRevenue = o.manual_revenue ?? 0;
  const trackcorePurchases = o.manual_purchases ?? 0;
  const pixelRevenue = o.revenue;
  const trackcoreCoverage = pixelRevenue > 0 ? trackcoreRevenue / pixelRevenue : 0;
  const trackcoreLooksReliable =
    trackcoreRevenue > 0 &&
    (trackcoreCoverage >= 0.4 || pixelRevenue < 100);

  const usingTrackcoreRevenue = trackcoreLooksReliable;
  const usingTrackcoreSales = trackcorePurchases > 0 && usingTrackcoreRevenue;
  const effectiveRevenue = usingTrackcoreRevenue ? trackcoreRevenue : pixelRevenue;
  const effectivePurchases = usingTrackcoreSales ? trackcorePurchases : o.purchases;
  const effectiveCpp = effectivePurchases > 0 ? o.spend / effectivePurchases : 0;
  const effectiveRoas = effectiveRevenue > 0 && o.spend > 0
    ? effectiveRevenue / o.spend
    : o.roas;

  // Faturamento: receita diaria. Sparkline usa daily total revenue (backend
  // nao tem breakdown manual por dia). Vazio pra clientes sem qualquer receita.
  const totalRevenue = series.reduce((s, p) => s + (p.revenue || 0), 0);
  const revenueSeries: number[] = totalRevenue > 0
    ? series.map((p) => p.revenue || 0)
    : [];
  // ROAS diário = revenue/spend por dia. Só mostra se há receita agregada;
  // do contrário, série vazia (esconde sparkline — não finge dado que não existe).
  const roasSeries: number[] = totalRevenue > 0
    ? series.map((p) => (p.spend > 0 ? (p.revenue || 0) / p.spend : 0))
    : [];
  // CTR diário real (clicks/impressions * 100), não usa impSeries como proxy.
  const ctrSeries = series.map((p) => (p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0));

  // Sempre recalculamos delta client-side via ratio(): backend retorna delta
  // ja em percentual (* 100), mas DeltaChip multiplica por 100 — gerava bug
  // de 100x maior. ratio() retorna decimal (0.1233 = 12.33%) consistente com
  // o que DeltaChip espera.
  const prev = compareOverride ?? o.previous_period;
  const roasLabel = effectiveRoas > 0 ? `${effectiveRoas.toFixed(2)}x` : "—";

  // Previous-period values pra comparacao. Quando usingTrackcore* esta ativo,
  // usamos a fonte equivalente (manual_*) no periodo anterior pra comparar
  // apples-to-apples. Senao usamos os campos canonicos da Meta.
  const prevTrackcoreRevenue = prev.manual_revenue ?? 0;
  const prevTrackcorePurchases = prev.manual_purchases ?? 0;
  const prevEffectiveRevenue = usingTrackcoreRevenue ? prevTrackcoreRevenue : prev.revenue;
  const prevEffectivePurchases = usingTrackcoreSales ? prevTrackcorePurchases : prev.purchases;
  const prevEffectiveRoas = prevEffectiveRevenue > 0 && prev.spend > 0
    ? prevEffectiveRevenue / prev.spend
    : prev.roas;

  // Helper: ratio delta com fallback null quando prev=0 (pra evitar divisao por zero
  // ou %s sem sentido tipo "+infinito%").
  const ratio = (cur: number, p: number): number | null => {
    if (!p || p === 0) return null;
    return (cur - p) / p;
  };

  return [
    {
      label: "Investimento",
      value: fmtBRL(o.spend),
      prevValue: fmtBRL(prev.spend),
      prevSeries: prevSpendSeries,
      unit: "BRL",
      delta: ratio(o.spend, prev.spend),
      deltaSemantic: "neutral",
      series: spendSeries,
      format: fmtBRL,
    },
    {
      label: o.messages > 0 ? `Mensagens · R$${o.cost_per_message.toFixed(2)}/msg` : "Mensagens",
      value: fmtIntCompact(o.messages),
      prevValue: fmtIntCompact(prev.messages),
      prevSeries: prevMsgSeries,
      unit: "",
      delta: ratio(o.messages, prev.messages),
      deltaSemantic: "up_better",
      series: msgSeries,
      format: (v) => fmtIntCompact(Math.round(v)),
    },
    {
      label: o.leads > 0 ? `Leads · R$${o.cost_per_lead.toFixed(2)}/lead` : "Leads",
      value: fmtIntCompact(o.leads),
      prevValue: fmtIntCompact(prev.leads),
      prevSeries: prevLeadSeries,
      unit: "",
      delta: ratio(o.leads, prev.leads),
      deltaSemantic: "up_better",
      series: leadSeries,
      format: (v) => Math.round(v).toLocaleString("pt-BR"),
    },
    {
      label: effectivePurchases > 0
        ? (usingTrackcoreSales
            ? `Vendas · R$${effectiveCpp.toFixed(2)}/venda · via Trackcore`
            : `Vendas · R$${effectiveCpp.toFixed(2)}/venda`)
        : (usingTrackcoreSales ? "Vendas · via Trackcore" : "Vendas"),
      value: fmtIntCompact(effectivePurchases),
      prevValue: fmtIntCompact(prevEffectivePurchases),
      prevSeries: prevPurchaseSeries,
      unit: "",
      delta: ratio(effectivePurchases, prevEffectivePurchases),
      deltaSemantic: "up_better",
      series: purchaseSeries,
      format: (v) => Math.round(v).toLocaleString("pt-BR"),
    },
    {
      label: usingTrackcoreRevenue ? "Faturamento · via Trackcore" : "Faturamento",
      value: effectiveRevenue > 0 ? fmtBRL(effectiveRevenue) : "—",
      prevValue: prevEffectiveRevenue > 0 ? fmtBRL(prevEffectiveRevenue) : "—",
      prevSeries: prevRevenueSeries,
      unit: "BRL",
      delta: ratio(effectiveRevenue, prevEffectiveRevenue),
      deltaSemantic: "up_better",
      series: revenueSeries,
      format: fmtBRL,
    },
    {
      label: usingTrackcoreRevenue ? "ROAS · via Trackcore" : "ROAS",
      value: roasLabel,
      prevValue: prevEffectiveRoas > 0 ? `${prevEffectiveRoas.toFixed(2)}x` : "—",
      prevSeries: prevRoasSeries,
      unit: "x",
      delta: ratio(effectiveRoas, prevEffectiveRoas),
      deltaSemantic: "up_better",
      series: roasSeries,
      format: (v) => v.toFixed(2) + "x",
    },
    {
      label: "Impressões",
      value: fmtIntCompact(o.impressions),
      prevValue: fmtIntCompact(prev.impressions),
      prevSeries: prevImpSeries,
      unit: "",
      delta: ratio(o.impressions, prev.impressions),
      deltaSemantic: "up_better",
      series: impSeries,
      format: (v) => fmtIntCompact(Math.round(v)),
    },
    {
      label: "Cliques",
      value: fmtIntCompact(o.clicks),
      prevValue: fmtIntCompact(prev.clicks),
      prevSeries: prevClkSeries,
      unit: "",
      delta: ratio(o.clicks, prev.clicks),
      deltaSemantic: "up_better",
      series: clkSeries,
      format: (v) => fmtIntCompact(Math.round(v)),
    },
    {
      label: "CTR",
      value: fmtPct(o.ctr),
      prevValue: fmtPct(prev.ctr),
      prevSeries: prevCtrSeries,
      unit: "%",
      delta: ratio(o.ctr, prev.ctr),
      deltaSemantic: "up_better",
      series: ctrSeries,
      format: (v) => fmtPct(v),
    },
  ];
}

/** Formata range de datas estilo "1–30 abr 2026" ou "28 mar – 27 abr 2026". */
function formatRangeBr(since: string, until: string): string {
  const a = new Date(`${since}T12:00:00`);
  const b = new Date(`${until}T12:00:00`);
  const month = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  }
  if (sameYear) {
    return `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  }
  return `${a.getDate()} ${month(a)} ${a.getFullYear()} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
}

/** Chip de delta semantico:
 *  - up_better: aumentar eh bom (revenue, vendas) → verde no positivo, vermelho no negativo
 *  - up_worse:  aumentar eh ruim (CPL, CPA) → vermelho no positivo, verde no negativo
 *  - neutral:   ambiguo (investimento) → cinza sempre
 *  delta=null (ex: prev=0) → mostra "—" cinza */
function DeltaChip({ delta, semantic }: { delta: number | null; semantic: DeltaSemantic }) {
  if (delta === null || !Number.isFinite(delta)) {
    return (
      <span className="mono" style={{
        fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.4,
        padding: "2px 6px", borderRadius: 4, background: "var(--surface-2)",
      }}>
        novo
      </span>
    );
  }
  const isFlat = Math.abs(delta) < 0.005; // < 0.5% trata como flat
  const isPositive = delta > 0;
  const pct = (delta * 100).toFixed(1).replace(/\.0$/, "");
  const sign = isPositive ? "+" : ""; // negativo ja vem com "-"

  let color: string;
  let bg: string;
  if (isFlat || semantic === "neutral") {
    color = "var(--ink-3)";
    bg = "var(--surface-2)";
  } else if (semantic === "up_better") {
    color = isPositive ? "var(--pos)" : "var(--neg)";
    bg = isPositive ? "var(--pos-bg)" : "var(--neg-bg)";
  } else { // up_worse
    color = isPositive ? "var(--neg)" : "var(--pos)";
    bg = isPositive ? "var(--neg-bg)" : "var(--pos-bg)";
  }

  const arrow = isFlat ? "→" : isPositive ? "↗" : "↘";

  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
      padding: "2px 6px", borderRadius: 4,
      color, background: bg,
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>{arrow}</span>
      {sign}{pct}%
    </span>
  );
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
