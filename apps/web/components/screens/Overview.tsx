"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

  // ─── Polling automatico ──────────────────────────────────────────────────
  // refetchInterval: 60s — re-fetcha as queries da Meta no banco a cada minuto.
  // refetchIntervalInBackground: false (default) — pausa quando aba escondida.
  // refetchOnWindowFocus: true (default RQ) — refetch instant quando volta tab.
  // Polling no FRONT so resolve metade — DB precisa estar fresco. Ver hot-sync
  // auto-trigger logo abaixo.
  const POLL_MS = 60_000;
  const overviewQ = useQuery<MetaOverview>({
    queryKey: ["meta", "overview", ...queryKeyBase],
    queryFn: () => metaOverview(slug, rangeOpts),
    enabled: !!slug,
    refetchInterval: POLL_MS,
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

  // Backfill manual (botao Sincronizar) — sync completo do periodo atual.
  // Pesado: days=N atual, level=ad (todos os niveis ate ad-creative).
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

  // Hot-sync rapido — disparado automaticamente quando dado tah stale.
  // days=2 (hoje + ontem), level=account (so a granularidade do overview,
  // sem ad-level que e custoso). Tipicamente termina em 5-15s.
  const hotSyncMut = useMutation({
    mutationFn: () => triggerMetaBackfill(slug, { days: 2, level: "account" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", slug] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["meta"] }), 4000);
    },
  });

  const campaignsQ = useQuery<MetaCampaignsResponse>({
    queryKey: ["meta", "campaigns", ...queryKeyBase],
    queryFn: () => metaCampaigns(slug, rangeOpts),
    enabled: !!slug,
    refetchInterval: POLL_MS,
  });
  const dailyQ = useQuery<MetaDailyResponse>({
    queryKey: ["meta", "daily", ...queryKeyBase],
    queryFn: () => metaDaily(slug, rangeOpts),
    enabled: !!slug,
    refetchInterval: POLL_MS,
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
    refetchInterval: POLL_MS,
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
    refetchInterval: POLL_MS,
  });

  // ─── Auto hot-sync ao mount se dado stale ──────────────────────────────
  // Logica:
  // 1. So roda 1x por mount (autoSyncFiredRef previne re-trigger em re-render)
  // 2. Pula se ja ha job running (evita corrida)
  // 3. Pula se ultimo job foi error (nao ficar batendo num backend quebrado)
  // 4. Dispara se ultimo job done > 30min ago, ou se nunca rodou pra esse slug
  // O sync e leve (days=2, level=account) e resolve em ~10s.
  const autoSyncFiredRef = useRef(false);
  const lastJob = jobsQ.data?.[0];
  const lastDoneAt = lastJob?.status === "done" && lastJob.finished_at
    ? new Date(lastJob.finished_at).getTime()
    : null;
  const lastErrored = lastJob?.status === "error";
  const STALE_MS = 30 * 60 * 1000; // 30min

  useEffect(() => {
    if (!slug) return;
    if (autoSyncFiredRef.current) return;
    if (jobsQ.isLoading) return; // espera saber se tem job recente
    if (running) return; // ja sincronizando
    if (hotSyncMut.isPending || backfillMut.isPending) return;
    if (lastErrored) return; // nao auto-recuperar de erro

    const stale = lastDoneAt == null || (Date.now() - lastDoneAt) > STALE_MS;
    if (!stale) return;

    autoSyncFiredRef.current = true;
    hotSyncMut.mutate();
  }, [slug, jobsQ.isLoading, running, lastDoneAt, lastErrored]);

  // Format "atualizado ha Xm" pra header. Usa lastDoneAt; ticka cada 30s
  // pra label nao ficar travado em "ha 1m" eternamente.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const lastSyncLabel = useMemo(() => {
    if (running) return "sincronizando…";
    if (!lastDoneAt) return "nunca sincronizado";
    const ageSec = Math.floor((Date.now() - lastDoneAt) / 1000);
    if (ageSec < 60) return "agora há pouco";
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 60) return `há ${ageMin}min`;
    const ageHr = Math.floor(ageMin / 60);
    if (ageHr < 24) return `há ${ageHr}h`;
    const ageDays = Math.floor(ageHr / 24);
    return `há ${ageDays}d`;
  }, [lastDoneAt, running]);

  // Funil — stages derivadas direto do MetaOverview. 6 etapas:
  // Investimento, Impressoes, Alcance, Mensagens, Leads, Compras.
  // Investimento eh moeda (especial) — outras sao counts e formam o funil
  // de conversao real. Sem chamada extra de API.

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
          {/* Indicador de freshness — passa o mouse pro tooltip detalhado */}
          <div
            className="sync-indicator"
            title={
              running
                ? "Sincronização em andamento — Meta API"
                : lastDoneAt
                  ? `Última sync: ${new Date(lastDoneAt).toLocaleString("pt-BR")}\nAuto-refresh: dado polled a cada 60s`
                  : "Nenhuma sincronização registrada — clique em Sincronizar"
            }
          >
            <span className={`sync-dot ${running ? "syncing" : lastErrored ? "err" : "ok"}`} />
            <span className="sync-label">{lastSyncLabel}</span>
          </div>
          <button
            className="btn ghost"
            onClick={() => backfillMut.mutate()}
            disabled={running || backfillMut.isPending || hotSyncMut.isPending}
            title={running ? "Sincronização em andamento…" : `Sincronizar últimos ${days} dias da Meta`}
          >
            <Icon name="refresh" size={12} />
            {running
              ? "Sincronizando…"
              : (backfillMut.isPending || hotSyncMut.isPending) ? "Enviando…" : "Sincronizar"}
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

          {/* Funil de conversao — 2 cards side-by-side, atual (orange) x compare (purple).
              Layout estatico (sem bars proporcionais ao valor); cada stage eh uma linha
              com colored stripe seguindo a cor do periodo. */}
          <div className="sec-head">
            <span className="num">SEÇÃO 03 · FUNIL DE CONVERSÃO</span>
            <h3>Etapas — atual × comparação</h3>
            <div className="rule" />
          </div>
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginBottom: 28,
          }}>
            <MiniFunnel
              stages={buildOverviewFunnelStages(overviewQ.data)}
              title="Período de análise"
              lineColor="var(--data-orange)"
              rangeLabel={formatRangeBr(overviewQ.data.since, overviewQ.data.until)}
            />
            <MiniFunnel
              stages={buildOverviewFunnelStages(compareQ.data ?? overviewQ.data.previous_period)}
              title={customCompare?.from && customCompare?.to ? "Período personalizado" : "Período anterior"}
              lineColor="var(--data-violet)"
              rangeLabel={
                compareQ.data
                  ? formatRangeBr(compareQ.data.since, compareQ.data.until)
                  : formatRangeBr(overviewQ.data.previous_period.since, overviewQ.data.previous_period.until)
              }
            />
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
      { label: "CPL",          value: dash, prevValue: dash, prevSeries: emptySeries, unit: "BRL", delta: null, deltaSemantic: "up_worse", series: emptySeries, format: fmtBRL },
      { label: "Custo por mensagem", value: dash, prevValue: dash, prevSeries: emptySeries, unit: "BRL", delta: null, deltaSemantic: "up_worse", series: emptySeries, format: fmtBRL },
      { label: "CAC",          value: dash, prevValue: dash, prevSeries: emptySeries, unit: "BRL", delta: null, deltaSemantic: "up_worse", series: emptySeries, format: fmtBRL },
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

  // Custo-por-X series (CAC, CPL, CPM). Dia com count=0 → custo=0 (sparkline
  // mostra dip; user entende que sem volume nao tem custo unitario).
  const cpkSeries = (countSeries: number[]) =>
    series.map((p, i) => (countSeries[i] > 0 ? p.spend / countSeries[i] : 0));
  const cplSeries = cpkSeries(leadSeries);
  const cpmSeries = cpkSeries(msgSeries);
  const cacSeries = cpkSeries(purchaseSeries);

  const prevCpkSeries = (countSeries: number[]) =>
    prevRows.map((p, i) => (countSeries[i] > 0 ? p.spend / countSeries[i] : 0));
  const prevCplSeries = prevCpkSeries(prevLeadSeries);
  const prevCpmSeries = prevCpkSeries(prevMsgSeries);
  const prevCacSeries = prevCpkSeries(prevPurchaseSeries);
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
      label: "CPL",
      value: o.leads > 0 ? fmtBRL(o.cost_per_lead) : "—",
      prevValue: prev.leads > 0 ? fmtBRL(prev.cost_per_lead) : "—",
      prevSeries: prevCplSeries,
      unit: "BRL",
      delta: ratio(o.cost_per_lead, prev.cost_per_lead),
      deltaSemantic: "up_worse",  // CPL maior eh ruim
      series: cplSeries,
      format: fmtBRL,
    },
    {
      label: "Custo por mensagem",
      value: o.messages > 0 ? fmtBRL(o.cost_per_message) : "—",
      prevValue: prev.messages > 0 ? fmtBRL(prev.cost_per_message) : "—",
      prevSeries: prevCpmSeries,
      unit: "BRL",
      delta: ratio(o.cost_per_message, prev.cost_per_message),
      deltaSemantic: "up_worse",
      series: cpmSeries,
      format: fmtBRL,
    },
    {
      label: "CAC",
      value: effectivePurchases > 0 ? fmtBRL(effectiveCpp) : "—",
      prevValue: prev.purchases > 0 ? fmtBRL(prev.cost_per_purchase) : "—",
      prevSeries: prevCacSeries,
      unit: "BRL",
      delta: ratio(effectiveCpp, prev.cost_per_purchase),
      deltaSemantic: "up_worse",
      series: cacSeries,
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

/**
 * Stage do funil derivada do MetaOverview.
 *  - `value`: numero exibido (R$ pra Investimento, count pras outras)
 *  - `riverValue`: numero usado pra calcular altura do rio. Pra Investimento
 *    usamos o valor de Impressoes pra o rio comecar visualmente alinhado ao
 *    "topo" do funil de counts. As outras stages usam o proprio value.
 *  - `isCurrency`: marca pra renderizar formato R$ no big text.
 */
type FunnelStageView = {
  key: string;
  label: string;
  value: number;
  riverValue: number;
  isCurrency?: boolean;
};

function buildOverviewFunnelStages(o: {
  spend: number; impressions: number; reach: number;
  messages: number; leads: number; purchases: number;
}): FunnelStageView[] {
  const impressions = o.impressions || 0;
  return [
    { key: "spend",       label: "Investimento", value: o.spend || 0,        riverValue: impressions, isCurrency: true },
    { key: "impressions", label: "Impressões",   value: impressions,         riverValue: impressions },
    { key: "reach",       label: "Alcance",      value: o.reach || 0,        riverValue: o.reach || 0 },
    { key: "messages",    label: "Mensagens",    value: o.messages || 0,     riverValue: o.messages || 0 },
    { key: "leads",       label: "Leads",        value: o.leads || 0,        riverValue: o.leads || 0 },
    { key: "purchases",   label: "Compras",      value: o.purchases || 0,    riverValue: o.purchases || 0 },
  ];
}

/**
 * MiniFunnel — funil de conversao com RIVER FLOWING (SVG path curvado).
 * Stages renderizam em colunas com label/% no center/valor no rodape.
 * O "rio" laranja/roxo flui de uma altura proporcional ao riverValue da
 * stage, com cubic bezier suavizando transicoes. 3 layers de opacidade
 * pra dar profundidade.
 */
function MiniFunnel({
  stages,
  title,
  lineColor,
  rangeLabel,
}: {
  stages: FunnelStageView[];
  title: string;
  lineColor: string;
  rangeLabel: string;
}) {
  if (stages.length === 0) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <FunnelHeader title={title} rangeLabel={rangeLabel} lineColor={lineColor} />
        <div style={{ color: "var(--ink-4)", padding: "60px 8px", fontSize: 12, textAlign: "center" }}>
          Sem dados no período
        </div>
      </div>
    );
  }

  // Geometria do SVG. Funil agora full-width (stack vertical em vez de side-by-side),
  // entao temos espaco lateral pra cada coluna respirar — texto nao corta mais.
  const VBW = 1200;
  const VBH = 380;
  const PAD_TOP = 76;     // espaco pro label header
  const PAD_BOT = 72;     // espaco pro value + drop% stack vertical
  const RIVER_AREA_H = VBH - PAD_TOP - PAD_BOT;
  const COL_W = VBW / stages.length;

  // riverValue normaliza altura do rio. Investimento usa o riverValue de
  // Impressoes (mesma unidade) — entao rio comeca alinhado ao topo do funil.
  const M = Math.max(...stages.map((s) => s.riverValue), 1);
  const MIN_RIVER_H = 8;  // stages quase-zero ainda visiveis

  type RiverPoint = { x: number; top: number; bot: number };
  const points: RiverPoint[] = stages.map((s, i) => {
    const x = i * COL_W + COL_W / 2;
    const h = Math.max((s.riverValue / M) * RIVER_AREA_H, MIN_RIVER_H);
    const top = PAD_TOP + (RIVER_AREA_H - h) / 2;
    return { x, top, bot: top + h };
  });
  // Adiciona ponto na borda esquerda + direita pra rio cobrir colunas inteiras
  const left: RiverPoint = { x: 0, top: points[0].top, bot: points[0].bot };
  const right: RiverPoint = {
    x: VBW,
    top: points[points.length - 1].top,
    bot: points[points.length - 1].bot,
  };
  const all: RiverPoint[] = [left, ...points, right];

  // Gera path do rio: top edge (cubic bezier suave) + right edge + bottom edge (reverso) + close.
  // Tension controla o quao curvada a transicao fica (0.0 = reta, 0.5 = bem curvada).
  const buildPath = (scale: number) => {
    // Escala vertical (1.0 = baseline, 1.2 = layer outer mais largo).
    const cy = PAD_TOP + RIVER_AREA_H / 2;
    const sp = all.map((p) => ({
      x: p.x,
      top: cy + (p.top - cy) * scale,
      bot: cy + (p.bot - cy) * scale,
    }));
    let d = `M ${sp[0].x},${sp[0].top}`;
    for (let i = 1; i < sp.length; i++) {
      const p0 = sp[i - 1];
      const p1 = sp[i];
      const dx = p1.x - p0.x;
      const c1x = p0.x + dx * 0.5;
      const c2x = p1.x - dx * 0.5;
      d += ` C ${c1x},${p0.top} ${c2x},${p1.top} ${p1.x},${p1.top}`;
    }
    d += ` L ${sp[sp.length - 1].x},${sp[sp.length - 1].bot}`;
    for (let i = sp.length - 2; i >= 0; i--) {
      const p0 = sp[i + 1];
      const p1 = sp[i];
      const dx = p0.x - p1.x;
      const c1x = p0.x - dx * 0.5;
      const c2x = p1.x + dx * 0.5;
      d += ` C ${c1x},${p0.bot} ${c2x},${p1.bot} ${p1.x},${p1.bot}`;
    }
    return d + " Z";
  };

  const gradId = `funnel-grad-${title.replace(/\s+/g, "")}`;
  // % cumulativo eh contra Impressoes (primeira stage de count) — Investimento
  // eh moeda, escapa do calculo. stages[1] = Impressoes.
  const topCount = stages[1]?.value ?? 0;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "20px 20px 0" }}>
        <FunnelHeader title={title} rangeLabel={rangeLabel} lineColor={lineColor} />
      </div>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: "auto", marginTop: 8 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.55" />
          </linearGradient>
          {/* Separator soft fading: transparente top → sutil center → transparente bottom */}
          <linearGradient id={`sep-grad-${title.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0" />
            <stop offset="35%"  stopColor="white" stopOpacity="0.10" />
            <stop offset="65%"  stopColor="white" stopOpacity="0.10" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Vertical separators — gradient fading nas pontas pra ficar discreto */}
        {stages.slice(1).map((_, i) => (
          <line
            key={`sep-${i}`}
            x1={(i + 1) * COL_W} y1={20}
            x2={(i + 1) * COL_W} y2={VBH - 20}
            stroke={`url(#sep-grad-${title.replace(/\s+/g, "")})`}
            strokeWidth={1}
          />
        ))}

        {/* River — 3 layers de profundidade (outer mais largo + transparente,
            inner solid). Scale 1.35 / 1.15 / 1.0 cria o "halo" do rio. */}
        <path d={buildPath(1.35)} fill={lineColor} opacity={0.10} />
        <path d={buildPath(1.15)} fill={lineColor} opacity={0.20} />
        <path d={buildPath(1.0)}  fill={`url(#${gradId})`} />

        {/* Stage labels (header) */}
        {stages.map((s, i) => {
          const cx = i * COL_W + COL_W / 2;
          return (
            <text
              key={`lbl-${s.key}`}
              x={cx} y={30}
              fill="var(--ink-3)"
              textAnchor="middle"
              fontSize={11}
              fontFamily="var(--font-sans)"
              fontWeight={600}
              letterSpacing={2}
              style={{ textTransform: "uppercase" }}
            >
              {s.label}
            </text>
          );
        })}

        {/* Big text no centro:
            - Investimento (currency): R$ formatado compacto
            - Impressoes (top count): "100%"
            - Demais: % cumulativo vs Impressoes (smart decimals) */}
        {stages.map((s, i) => {
          const cx = i * COL_W + COL_W / 2;
          const cy = PAD_TOP + RIVER_AREA_H / 2 + 10;
          let bigText: string;
          if (s.isCurrency) {
            bigText = fmtBRL(s.value, { compact: s.value >= 10000 });
          } else if (i === 1) {
            bigText = "100%";
          } else {
            const pct = topCount > 0 ? (s.value / topCount) * 100 : 0;
            bigText =
              pct >= 10 ? `${pct.toFixed(0)}%` :
              pct >= 1  ? `${pct.toFixed(1)}%` :
              pct > 0   ? `${pct.toFixed(2)}%` :
              "0%";
          }
          return (
            <text
              key={`pct-${s.key}`}
              x={cx} y={cy}
              fill="white"
              textAnchor="middle"
              fontSize={28}
              fontWeight={700}
              fontFamily="var(--font-sans)"
              style={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.6 }}
            >
              {bigText}
            </text>
          );
        })}

        {/* Bottom: value (com unidade correta) acima, drop% vermelho abaixo.
            Stack vertical evita overlap mesmo em colunas estreitas. */}
        {stages.map((s, i) => {
          const cx = i * COL_W + COL_W / 2;
          const valueY = VBH - 30;
          const dropY = VBH - 14;
          // drop% so faz sentido entre stages count→count
          // (Investimento → Impressoes = unidades diferentes, skip)
          const prev = stages[i - 1];
          const dropEligible = i >= 2 && prev && !prev.isCurrency && prev.value > 0;
          const drop = dropEligible ? (s.value / prev.value - 1) * 100 : null;
          const valueText = s.isCurrency ? fmtBRL(s.value) : fmtIntCompact(s.value);
          return (
            <g key={`btm-${s.key}`}>
              <text
                x={cx} y={valueY}
                fill="var(--ink-2)"
                textAnchor="middle"
                fontSize={12}
                fontFamily="var(--font-sans)"
                fontWeight={600}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {valueText}
              </text>
              {drop !== null && (
                <text
                  x={cx} y={dropY}
                  fill={drop < 0 ? "var(--neg)" : "var(--pos)"}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="var(--font-sans)"
                  fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 0.2 }}
                >
                  {drop > 0 ? "+" : ""}{drop.toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FunnelHeader({
  title, rangeLabel, lineColor,
}: { title: string; rangeLabel: string; lineColor: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "baseline", gap: 12,
    }}>
      <div className="card-title" style={{ color: lineColor, letterSpacing: 0.2 }}>
        {title}
      </div>
      <div className="card-sub" style={{ margin: 0 }}>{rangeLabel}</div>
    </div>
  );
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
