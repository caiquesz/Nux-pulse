"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BigChart } from "@/components/primitives/BigChart";
import {
  metaOverview, metaDaily,
  type MetaOverview, type MetaDailyResponse,
  type RangeOpts,
} from "@/lib/api";
import { fmtBRL, fmtInt, fmtIntCompact, fmtPct } from "@/lib/fmt";

type ClientLite = { slug: string; name: string };

/**
 * Tela de comparacao side-by-side entre 2 empresas.
 * - Lado esquerdo: orange (atual / lado A)
 * - Lado direito:  violet (comparacao / lado B)
 *
 * Renderiza KPIs principais, grafico diario e funil de conversao em paralelo.
 * Usuario seleciona 2 empresas via dropdown — fetch separado por slug.
 */
export function CompareClients({
  clients,
  rangeOpts,
}: {
  clients: ClientLite[];
  rangeOpts: RangeOpts;
}) {
  const [leftSlug, setLeftSlug] = useState<string>("");
  const [rightSlug, setRightSlug] = useState<string>("");

  const leftOv = useQuery<MetaOverview>({
    queryKey: ["compare-ov", leftSlug, rangeOpts],
    queryFn: () => metaOverview(leftSlug, rangeOpts),
    enabled: !!leftSlug,
  });
  const rightOv = useQuery<MetaOverview>({
    queryKey: ["compare-ov", rightSlug, rangeOpts],
    queryFn: () => metaOverview(rightSlug, rangeOpts),
    enabled: !!rightSlug,
  });
  const leftDaily = useQuery<MetaDailyResponse>({
    queryKey: ["compare-dy", leftSlug, rangeOpts],
    queryFn: () => metaDaily(leftSlug, rangeOpts),
    enabled: !!leftSlug,
  });
  const rightDaily = useQuery<MetaDailyResponse>({
    queryKey: ["compare-dy", rightSlug, rangeOpts],
    queryFn: () => metaDaily(rightSlug, rangeOpts),
    enabled: !!rightSlug,
  });

  const leftName = clients.find((c) => c.slug === leftSlug)?.name ?? "—";
  const rightName = clients.find((c) => c.slug === rightSlug)?.name ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ─── Pickers side-by-side ──────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}>
        <ClientPicker
          label="Empresa A"
          accent="var(--data-orange)"
          value={leftSlug}
          onChange={setLeftSlug}
          clients={clients}
          excludeSlug={rightSlug}
        />
        <ClientPicker
          label="Empresa B"
          accent="var(--data-violet)"
          value={rightSlug}
          onChange={setRightSlug}
          clients={clients}
          excludeSlug={leftSlug}
        />
      </div>

      {(!leftSlug || !rightSlug) && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6,
          }}>
            Escolha duas empresas pra comparar
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            KPIs, gráfico diário e funil aparecem lado a lado
          </div>
        </div>
      )}

      {/* ─── KPIs side-by-side ─────────────────────────────────────── */}
      {leftSlug && rightSlug && (
        <div className="sec-head">
          <span className="num">01 · MÉTRICAS</span>
          <h3>Resultado do período</h3>
          <div className="rule" />
        </div>
      )}
      {leftSlug && rightSlug && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <KpiColumn data={leftOv.data} loading={leftOv.isLoading} accent="var(--data-orange)" name={leftName} />
          <KpiColumn data={rightOv.data} loading={rightOv.isLoading} accent="var(--data-violet)" name={rightName} />
        </div>
      )}

      {/* ─── Daily charts side-by-side ────────────────────────────── */}
      {leftSlug && rightSlug && (
        <>
          <div className="sec-head">
            <span className="num">02 · TENDÊNCIA DIÁRIA</span>
            <h3>Investimento ao longo do período</h3>
            <div className="rule" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard
              data={leftDaily.data}
              accent="var(--data-orange)"
              fillColor="oklch(0.74 0.20 50 / 0.16)"
              name={leftName}
              loading={leftDaily.isLoading}
            />
            <ChartCard
              data={rightDaily.data}
              accent="var(--data-violet)"
              fillColor="oklch(0.70 0.20 280 / 0.18)"
              name={rightName}
              loading={rightDaily.isLoading}
            />
          </div>
        </>
      )}

      {/* ─── Funil side-by-side ──────────────────────────────────── */}
      {leftSlug && rightSlug && (
        <>
          <div className="sec-head">
            <span className="num">03 · FUNIL DE CONVERSÃO</span>
            <h3>Etapas — A × B</h3>
            <div className="rule" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FunnelMini
              data={leftOv.data}
              accent="var(--data-orange)"
              name={leftName}
              loading={leftOv.isLoading}
            />
            <FunnelMini
              data={rightOv.data}
              accent="var(--data-violet)"
              name={rightName}
              loading={rightOv.isLoading}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────

function ClientPicker({
  label, accent, value, onChange, clients, excludeSlug,
}: {
  label: string;
  accent: string;
  value: string;
  onChange: (s: string) => void;
  clients: ClientLite[];
  excludeSlug?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{
        fontSize: 10, color: "var(--ink-4)", letterSpacing: 1.2,
        textTransform: "uppercase", fontWeight: 600, marginBottom: 8,
      }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "var(--surface-2)",
          color: "var(--ink)",
          border: `1px solid ${value ? accent : "var(--border-2)"}`,
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          appearance: "none",
          fontFamily: "var(--font-sans)",
          transition: "border-color 200ms ease",
        }}
      >
        <option value="">— Selecionar —</option>
        {clients
          .filter((c) => c.slug !== excludeSlug)
          .map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
      </select>
    </div>
  );
}

function KpiColumn({
  data, loading, accent, name,
}: { data: MetaOverview | undefined; loading: boolean; accent: string; name: string }) {
  const cards = useMemo(() => {
    if (!data) return [];
    const trackcoreRevenue = data.manual_revenue ?? 0;
    const pixelRevenue = data.revenue;
    const coverage = pixelRevenue > 0 ? trackcoreRevenue / pixelRevenue : 0;
    const useTC = trackcoreRevenue > 0 && (coverage >= 0.4 || pixelRevenue < 100);
    const effRev = useTC ? trackcoreRevenue : pixelRevenue;
    const effPur = useTC && (data.manual_purchases ?? 0) > 0 ? data.manual_purchases! : data.purchases;
    const effRoas = effRev > 0 && data.spend > 0 ? effRev / data.spend : data.roas;

    return [
      { label: "Investimento", value: fmtBRL(data.spend) },
      { label: "Mensagens",    value: fmtIntCompact(data.messages) },
      { label: "Leads",        value: fmtIntCompact(data.leads) },
      { label: "Vendas",       value: fmtIntCompact(effPur) },
      { label: "Faturamento",  value: effRev > 0 ? fmtBRL(effRev) : "—" },
      { label: "ROAS",         value: effRoas > 0 ? `${effRoas.toFixed(2)}x` : "—" },
      { label: "Impressões",   value: fmtIntCompact(data.impressions) },
      { label: "Cliques",      value: fmtIntCompact(data.clicks) },
      { label: "CTR",          value: fmtPct(data.ctr) },
    ];
  }, [data]);

  return (
    <div className="card" style={{ padding: 18, "--chart-line": accent } as React.CSSProperties}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: accent, boxShadow: `0 0 12px ${accent}`,
        }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
          {name}
        </div>
      </div>
      {loading && !data ? (
        <div style={{ color: "var(--ink-3)", fontSize: 12, padding: "20px 0" }}>Carregando…</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
        }}>
          {cards.map((k) => (
            <div key={k.label} style={{
              padding: "10px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}>
              <div className="mono" style={{
                fontSize: 9, color: "var(--ink-4)",
                letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600,
                marginBottom: 4,
              }}>
                {k.label}
              </div>
              <div style={{
                fontSize: 18, fontWeight: 700, color: "var(--ink)",
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px",
              }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCard({
  data, accent, fillColor, name, loading,
}: {
  data: MetaDailyResponse | undefined;
  accent: string;
  fillColor: string;
  name: string;
  loading: boolean;
}) {
  const series = data?.series.map((p) => p.spend) ?? [];
  const labels = data?.series.map((p) => {
    const [, mm, dd] = p.date.split("-");
    return `${dd}/${mm}`;
  }) ?? [];

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: accent, boxShadow: `0 0 12px ${accent}`,
        }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
          {name}
        </div>
      </div>
      {loading && !data ? (
        <div style={{
          height: 200, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--ink-4)", fontSize: 12,
        }}>
          Carregando…
        </div>
      ) : series.length > 1 ? (
        <BigChart
          series={series}
          labels={labels}
          seriesLabel="Investimento"
          seriesFormat={fmtBRL}
          height={200}
          lineColor={accent}
          fillColor={fillColor}
          axisColor="var(--ink-4)"
          gridColor="rgba(255,255,255,0.06)"
        />
      ) : (
        <div style={{
          height: 200, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--ink-4)", fontSize: 12,
        }}>
          Sem dados diários no período
        </div>
      )}
    </div>
  );
}

function FunnelMini({
  data, accent, name, loading,
}: { data: MetaOverview | undefined; accent: string; name: string; loading: boolean }) {
  const stages = useMemo(() => {
    if (!data) return [];
    const impressions = data.impressions || 0;
    return [
      { key: "spend",       label: "Investimento", value: data.spend || 0,        riverValue: impressions, isCurrency: true },
      { key: "impressions", label: "Impressões",   value: impressions,            riverValue: impressions },
      { key: "reach",       label: "Alcance",      value: data.reach || 0,        riverValue: data.reach || 0 },
      { key: "messages",    label: "Mensagens",    value: data.messages || 0,     riverValue: data.messages || 0 },
      { key: "leads",       label: "Leads",        value: data.leads || 0,        riverValue: data.leads || 0 },
      { key: "purchases",   label: "Compras",      value: data.purchases || 0,    riverValue: data.purchases || 0 },
    ];
  }, [data]);

  if (loading && !data) {
    return (
      <div className="card" style={{ padding: 18, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando…</div>
      </div>
    );
  }
  if (stages.length === 0) {
    return (
      <div className="card" style={{ padding: 18, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--ink-4)", fontSize: 12 }}>Sem dados no período</div>
      </div>
    );
  }

  // Geometria SVG (mesma logica do MiniFunnel do Overview)
  const VBW = 1200;
  const VBH = 360;
  const PAD_TOP = 70;
  const PAD_BOT = 68;
  const RIVER_AREA_H = VBH - PAD_TOP - PAD_BOT;
  const COL_W = VBW / stages.length;
  const M = Math.max(...stages.map((s) => s.riverValue), 1);
  const MIN_RIVER_H = 8;

  type RiverPoint = { x: number; top: number; bot: number };
  const points: RiverPoint[] = stages.map((s, i) => {
    const x = i * COL_W + COL_W / 2;
    const h = Math.max((s.riverValue / M) * RIVER_AREA_H, MIN_RIVER_H);
    const top = PAD_TOP + (RIVER_AREA_H - h) / 2;
    return { x, top, bot: top + h };
  });
  const left: RiverPoint = { x: 0, top: points[0].top, bot: points[0].bot };
  const right: RiverPoint = { x: VBW, top: points[points.length - 1].top, bot: points[points.length - 1].bot };
  const all: RiverPoint[] = [left, ...points, right];

  const buildPath = (scale: number) => {
    const cy = PAD_TOP + RIVER_AREA_H / 2;
    const sp = all.map((p) => ({
      x: p.x,
      top: cy + (p.top - cy) * scale,
      bot: cy + (p.bot - cy) * scale,
    }));
    let d = `M ${sp[0].x},${sp[0].top}`;
    for (let i = 1; i < sp.length; i++) {
      const p0 = sp[i - 1]; const p1 = sp[i];
      const dx = p1.x - p0.x;
      d += ` C ${p0.x + dx * 0.5},${p0.top} ${p1.x - dx * 0.5},${p1.top} ${p1.x},${p1.top}`;
    }
    d += ` L ${sp[sp.length - 1].x},${sp[sp.length - 1].bot}`;
    for (let i = sp.length - 2; i >= 0; i--) {
      const p0 = sp[i + 1]; const p1 = sp[i];
      const dx = p0.x - p1.x;
      d += ` C ${p0.x - dx * 0.5},${p0.bot} ${p1.x + dx * 0.5},${p1.bot} ${p1.x},${p1.bot}`;
    }
    return d + " Z";
  };

  const gradId = `cmp-funnel-${name.replace(/\s+/g, "")}`;
  const sepGradId = `cmp-sep-${name.replace(/\s+/g, "")}`;
  const topCount = stages[1]?.value ?? 0;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: accent, boxShadow: `0 0 12px ${accent}`,
        }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
          {name}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: "auto", marginTop: 8 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={sepGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0" />
            <stop offset="35%"  stopColor="white" stopOpacity="0.10" />
            <stop offset="65%"  stopColor="white" stopOpacity="0.10" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {stages.slice(1).map((_, i) => (
          <line
            key={`sep-${i}`}
            x1={(i + 1) * COL_W} y1={20}
            x2={(i + 1) * COL_W} y2={VBH - 20}
            stroke={`url(#${sepGradId})`}
            strokeWidth={1}
          />
        ))}

        <path d={buildPath(1.35)} fill={accent} opacity={0.10} />
        <path d={buildPath(1.15)} fill={accent} opacity={0.20} />
        <path d={buildPath(1.0)}  fill={`url(#${gradId})`} />

        {stages.map((s, i) => {
          const cx = i * COL_W + COL_W / 2;
          return (
            <text key={`lbl-${s.key}`}
              x={cx} y={30} fill="var(--ink-3)" textAnchor="middle"
              fontSize={11} fontFamily="var(--font-sans)" fontWeight={600}
              letterSpacing={2} style={{ textTransform: "uppercase" }}>
              {s.label}
            </text>
          );
        })}

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
            <text key={`pct-${s.key}`}
              x={cx} y={cy} fill="white" textAnchor="middle"
              fontSize={28} fontWeight={700} fontFamily="var(--font-sans)"
              style={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.6 }}>
              {bigText}
            </text>
          );
        })}

        {stages.map((s, i) => {
          const cx = i * COL_W + COL_W / 2;
          const valueY = VBH - 30;
          const dropY = VBH - 14;
          const prev = stages[i - 1];
          const dropEligible = i >= 2 && prev && !prev.isCurrency && prev.value > 0;
          const drop = dropEligible ? (s.value / prev.value - 1) * 100 : null;
          const valueText = s.isCurrency ? fmtBRL(s.value) : fmtIntCompact(s.value);
          return (
            <g key={`btm-${s.key}`}>
              <text x={cx} y={valueY} fill="var(--ink-2)" textAnchor="middle"
                fontSize={12} fontFamily="var(--font-sans)" fontWeight={600}
                style={{ fontVariantNumeric: "tabular-nums" }}>
                {valueText}
              </text>
              {drop !== null && (
                <text x={cx} y={dropY}
                  fill={drop < 0 ? "var(--neg)" : "var(--pos)"}
                  textAnchor="middle" fontSize={10} fontFamily="var(--font-sans)" fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 0.2 }}>
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
