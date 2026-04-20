"use client";
import { useQuery } from "@tanstack/react-query";
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
  metaOverview, metaCampaigns, metaDaily,
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

  const kpis = useMemo(() => buildKpis(overviewQ.data), [overviewQ.data]);
  const series = useMemo(() => (dailyQ.data?.series ?? []).map((p) => p.spend), [dailyQ.data]);

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
              {series.length > 0 && (
                <div className="stat-spark">
                  <Sparkline series={series.length > 1 ? series : [0, 0]} height={36} />
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
        <div style={{ marginTop: 20, position: "relative", zIndex: 1 }}>
          {series.length > 1 ? (
            <BigChart
              series={series}
              height={220}
              lineColor="var(--lime)"
              fillColor="oklch(0.90 0.22 125 / 0.18)"
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
type Kpi = { label: string; value: string };

function buildKpis(o: MetaOverview | undefined): Kpi[] {
  if (!o) {
    return [
      { label: "Investimento", value: "—" },
      { label: "Impressões", value: "—" },
      { label: "Cliques", value: "—" },
      { label: "Alcance", value: "—" },
      { label: "CTR", value: "—" },
      { label: "CPC médio", value: "—" },
    ];
  }
  return [
    { label: "Investimento", value: fmtBRL(o.spend) },
    { label: "Impressões", value: fmtIntCompact(o.impressions) },
    { label: "Cliques", value: fmtIntCompact(o.clicks) },
    { label: "Alcance", value: fmtIntCompact(o.reach) },
    { label: "CTR", value: fmtPct(o.ctr) },
    { label: "CPC médio", value: fmtBRL(o.cpc) },
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
