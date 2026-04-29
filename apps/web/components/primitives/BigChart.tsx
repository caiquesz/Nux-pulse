"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { seriesToPath, seriesToBars, formatShort } from "@/lib/chart-utils";

/** Linha extra com escala propria (auto-normalizada). Render solido, sem dasharray. */
export type ExtraSeries = {
  values: number[];
  label: string;
  /** Cor — use tokens da paleta de dados: var(--data-cyan), var(--data-lime), etc. */
  color: string;
  format?: (v: number) => string;
};

type Props = {
  series: number[];
  /** @deprecated Use `extras` em vez de `compare` — extras suporta N linhas com cores proprias. */
  compare?: number[];
  /** Linhas adicionais (ex: conversas, vendas). Renderizadas solidas com cores da paleta de dados. */
  extras?: ExtraSeries[];
  /** Labels (datas, ex: "14/04") alinhadas com cada ponto — aparece no tooltip. */
  labels?: string[];
  seriesLabel?: string;
  seriesFormat?: (v: number) => string;
  compareLabel?: string;
  compareFormat?: (v: number) => string;
  style?: "line" | "area" | "bar";
  height?: number;
  /** CSS custom-property ou cor direta (ex: "var(--data-orange)" ou "#FF6B35"). */
  lineColor?: string;
  fillColor?: string;
  /** Cor da linha de comparação (default neutro). */
  compareColor?: string;
  /** Cor dos labels/grid — útil pra gráfico sobre fundo escuro. */
  axisColor?: string;
  gridColor?: string;
};

export function BigChart({
  series,
  compare,
  extras,
  labels,
  seriesLabel,
  seriesFormat = (v) => formatShort(v, true),
  compareLabel,
  compareFormat = (v) => formatShort(v, true),
  style = "area",
  height = 260,
  lineColor = "var(--chart-line)",
  fillColor = "var(--chart-fill)",
  compareColor = "var(--chart-line-2)",
  axisColor = "var(--ink-4)",
  gridColor = "var(--chart-grid)",
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);
  const fillGradId = `bigchart-fill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lineGradId = `bigchart-line-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(200, e[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // Paddings — generosos o suficiente pra comportar labels "R$ 1.234" sem overflow.
  const padL = 52;
  // Sem coluna direita de eixo: extras / compare aparecem so no tooltip pra
  // evitar gridlines duplicadas confusas. Mantem padR pequeno.
  const padR = 16;
  const padT = 12;
  const padB = 26;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, height - padT - padB);

  // Geração dos paths — passa padL/padT porque o util do chart usa "pad" uniforme.
  // Truque: renderiza o gráfico numa caixa diferente via transform.
  const { line, area } = useMemo(() => seriesToPath(series, plotW + padL * 2, plotH + padT * 2, padL), [series, plotW, plotH, padL, padT]);
  const cmpPath = useMemo(() => (compare ? seriesToPath(compare, plotW + padL * 2, plotH + padT * 2, padL) : null), [compare, plotW, plotH, padL, padT]);
  // Extras: cada um auto-normalizado independente (escala propria). Path usa o mesmo util.
  const extraPaths = useMemo(
    () => (extras ?? []).map((e) => ({
      ...e,
      path: seriesToPath(e.values, plotW + padL * 2, plotH + padT * 2, padL),
    })),
    [extras, plotW, plotH, padL, padT],
  );
  const barData = useMemo(() => seriesToBars(series, plotW, plotH, 3), [series, plotW, plotH]);

  const max = Math.max(...series);
  const min = Math.min(...series, 0);

  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => padT + (plotH * i) / yTicks);

  // xLabels: se veio labels[], distribui 6 amostras dele; senão usa rótulos relativos ("30d"…"hoje").
  const xLabels = useMemo(() => {
    if (labels && labels.length >= 2) {
      const n = 6;
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.round((i * (labels.length - 1)) / (n - 1));
        out.push(labels[idx] ?? "");
      }
      return out;
    }
    return ["30d", "24d", "18d", "12d", "6d", "hoje"];
  }, [labels]);

  const onMove = (e: React.MouseEvent) => {
    if (!wrap.current) return;
    const rect = wrap.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rel = ((x - padL) / plotW) * (series.length - 1);
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(rel)));
    setHover({ idx, x: padL + (idx * plotW) / Math.max(1, series.length - 1) });
  };

  const hoverY = hover ? padT + plotH - ((series[hover.idx] - min) / (max - min || 1)) * plotH : 0;

  return (
    <div ref={wrap} style={{ position: "relative", height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} style={{ display: "block" }}>
        <defs>
          {/* Fill gradient: line color at top (32% opacity) → transparent at bottom.
              Plus a subtle horizontal sheen for the "fluid" Cryptox-style fill. */}
          <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={lineColor} stopOpacity="0.36" />
            <stop offset="50%" stopColor={lineColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
          {/* Line gradient: brighter on top of arc, slightly dimmer at sides. */}
          <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.7" />
            <stop offset="50%"  stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* Grid lines horizontais */}
        {gridLines.map((y, i) => (
          <line key={i} x1={padL} x2={w - padR} y1={y} y2={y} stroke={gridColor} strokeWidth={1} />
        ))}

        {/* Eixo Y esquerdo (series principal) */}
        {gridLines.map((y, i) => {
          const v = max - ((max - min) * i) / yTicks;
          return (
            <text key={i} x={padL - 6} y={y + 3} fontSize={9} fontFamily="var(--font-mono)"
                  fill={axisColor} letterSpacing={0.3} textAnchor="end">
              {seriesFormat(v)}
            </text>
          );
        })}

        {/* Sem eixo Y direito — extras tem escalas heterogeneas (R$ × contagem),
            entao mostramos valores so no tooltip pra evitar gridlines confusas. */}

        {/* Eixo X (datas) */}
        {xLabels.map((l, i) => (
          <text key={i} x={padL + (plotW * i) / (xLabels.length - 1)} y={height - 8} fontSize={9}
                fontFamily="var(--font-mono)" fill={axisColor} textAnchor="middle" letterSpacing={0.3}>
            {l}
          </text>
        ))}

        {style === "bar" ? (
          barData.map((b, i) => (
            <rect key={i} x={padL + b.x} y={padT + b.y} width={b.w} height={b.h}
                  fill={lineColor} opacity={hover?.idx === i ? 1 : 0.82} rx={1.5} />
          ))
        ) : (
          <>
            {style !== "line" && <path d={area} fill={`url(#${fillGradId})`} />}
            {/* Extras (multi-line) renderizadas SOLIDAS com cores proprias.
                Layer abaixo da linha primaria pra primaria continuar dominante. */}
            {extraPaths.map((e, i) => (
              <path
                key={`extra-${i}`}
                d={e.path.line}
                fill="none"
                stroke={e.color}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
            ))}
            {/* compare legacy — agora SOLIDO (era tracejado). Recomenda-se migrar pra extras. */}
            {cmpPath && (
              <path d={cmpPath.line} fill="none" stroke={compareColor} strokeWidth={1.75}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
            )}
            <path d={line} fill="none" stroke={`url(#${lineGradId})`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {hover && style !== "bar" && (
          <>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={height - padB}
                  stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3" opacity={0.4} />
            <circle cx={hover.x} cy={hoverY} r={4} fill="var(--bg)" stroke={lineColor} strokeWidth={1.75} />
          </>
        )}
      </svg>
      {hover && (
        <div style={{
          position: "absolute", left: Math.min(hover.x + 12, w - 200), top: 8,
          background: "var(--ink)", color: "var(--accent-ink)",
          padding: "8px 10px", borderRadius: 6, fontSize: 11, pointerEvents: "none",
          fontFamily: "var(--font-mono)", letterSpacing: "0.5px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)", whiteSpace: "nowrap",
        }}>
          <div style={{ opacity: 0.6, fontSize: 9, textTransform: "uppercase", marginBottom: 4 }}>
            {labels?.[hover.idx] ?? `dia ${series.length - hover.idx}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: "inline-block" }} />
            <span style={{ opacity: 0.7, fontWeight: 400 }}>{seriesLabel ?? ""}</span>
            <span>{seriesFormat(series[hover.idx])}</span>
          </div>
          {compare && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 3 }}>
              <span style={{
                width: 8, height: 2, background: compareColor,
                display: "inline-block", borderRadius: 1,
              }} />
              <span style={{ opacity: 0.7 }}>{compareLabel ?? "comparação"}</span>
              <span style={{ opacity: 0.9 }}>{compareFormat(compare[hover.idx])}</span>
            </div>
          )}
          {extras && extras.map((e, i) => (
            <div key={`extra-tt-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 3 }}>
              <span style={{
                width: 8, height: 2, background: e.color,
                display: "inline-block", borderRadius: 1,
              }} />
              <span style={{ opacity: 0.7 }}>{e.label}</span>
              <span style={{ opacity: 0.9 }}>
                {(e.format ?? ((v: number) => Math.round(v).toLocaleString("pt-BR")))(e.values[hover.idx])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
