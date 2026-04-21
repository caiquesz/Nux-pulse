"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { seriesToPath, seriesToBars, formatShort } from "@/lib/chart-utils";

type Props = {
  series: number[];
  compare?: number[];
  /** Labels (datas, ex: "14/04") alinhadas com cada ponto — aparece no tooltip. */
  labels?: string[];
  seriesLabel?: string;
  seriesFormat?: (v: number) => string;
  compareLabel?: string;
  compareFormat?: (v: number) => string;
  style?: "line" | "area" | "bar";
  height?: number;
  /** CSS custom-property ou cor direta (ex: "var(--lime)" ou "#D4F24A"). */
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

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(200, e[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const pad = 24;
  const plotW = w - pad * 2;
  const plotH = height - pad * 2;

  const { line, area } = useMemo(() => seriesToPath(series, w, height, pad), [series, w, height]);
  const cmpPath = useMemo(() => (compare ? seriesToPath(compare, w, height, pad) : null), [compare, w, height]);
  const barData = useMemo(() => seriesToBars(series, plotW, plotH, 3), [series, plotW, plotH]);

  const max = Math.max(...series);
  const min = Math.min(...series);
  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => pad + (plotH * i) / yTicks);

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
    const idx = Math.round(((x - pad) / plotW) * (series.length - 1));
    if (idx >= 0 && idx < series.length) setHover({ idx, x: pad + (idx * plotW) / (series.length - 1) });
  };

  const hoverY = hover ? pad + plotH - ((series[hover.idx] - min) / (max - min || 1)) * plotH : 0;

  return (
    <div ref={wrap} style={{ position: "relative", height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} style={{ display: "block" }}>
        {gridLines.map((y, i) => (
          <line key={i} x1={pad} x2={w - pad} y1={y} y2={y} stroke={gridColor} strokeWidth={1} />
        ))}
        {gridLines.map((y, i) => {
          const v = max - ((max - min) * i) / yTicks;
          return (
            <text key={i} x={4} y={y + 3} fontSize={9} fontFamily="var(--font-mono)" fill={axisColor} letterSpacing={0.5}>
              {seriesFormat(v)}
            </text>
          );
        })}
        {xLabels.map((l, i) => (
          <text key={i} x={pad + (plotW * i) / (xLabels.length - 1)} y={height - 4} fontSize={9}
                fontFamily="var(--font-mono)" fill={axisColor} textAnchor="middle" letterSpacing={0.5}>
            {l}
          </text>
        ))}

        {style === "bar" ? (
          barData.map((b, i) => (
            <rect key={i} x={pad + b.x} y={pad + b.y} width={b.w} height={b.h}
                  fill={lineColor} opacity={hover?.idx === i ? 1 : 0.82} rx={1.5} />
          ))
        ) : (
          <>
            {style !== "line" && <path d={area} fill={fillColor} />}
            {cmpPath && (
              <path d={cmpPath.line} fill="none" stroke={compareColor} strokeWidth={1.5} strokeDasharray="4 4" />
            )}
            <path d={line} fill="none" stroke={lineColor} strokeWidth={1.75} />
          </>
        )}

        {hover && style !== "bar" && (
          <>
            <line x1={hover.x} x2={hover.x} y1={pad} y2={height - pad}
                  stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3" opacity={0.4} />
            <circle cx={hover.x} cy={hoverY} r={4} fill="var(--bg)" stroke="var(--ink)" strokeWidth={1.75} />
          </>
        )}
      </svg>
      {hover && (
        <div style={{
          position: "absolute", left: Math.min(hover.x + 12, w - 180), top: 8,
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
              <span
                style={{
                  width: 8, height: 2, background: compareColor,
                  display: "inline-block", borderRadius: 1,
                }}
              />
              <span style={{ opacity: 0.7 }}>{compareLabel ?? "comparação"}</span>
              <span style={{ opacity: 0.9 }}>{compareFormat(compare[hover.idx])}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
