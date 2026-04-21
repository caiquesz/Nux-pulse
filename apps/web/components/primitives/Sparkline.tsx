"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { seriesToPath, seriesToBars } from "@/lib/chart-utils";

type Props = {
  series: number[];
  /** Labels alinhadas com cada ponto (ex: "14/abr"). Mostradas no tooltip. */
  labels?: string[];
  /** Formatador do valor exibido no tooltip. */
  format?: (v: number) => string;
  height?: number;
  style?: "line" | "area" | "bar";
  compare?: number[];
};

export function Sparkline({
  series,
  labels,
  format = (v) => v.toLocaleString("pt-BR"),
  height = 36,
  style = "area",
  compare,
}: Props) {
  const [w, setW] = useState(120);
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { line, area } = useMemo(() => seriesToPath(series, w, height, 2), [series, w, height]);
  const bars = useMemo(() => (style === "bar" ? seriesToBars(series, w, height, 2) : null), [series, w, height, style]);
  const cmp = useMemo(() => (compare ? seriesToPath(compare, w, height, 2) : null), [compare, w, height]);

  const max = useMemo(() => Math.max(...series, 0), [series]);
  const min = useMemo(() => Math.min(...series, 0), [series]);

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current || series.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    // mapeia [2, w-2] → [0, series.length-1] (padding 2px igual ao seriesToPath)
    const pad = 2;
    const plotW = Math.max(1, w - pad * 2);
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(((rx - pad) / plotW) * (series.length - 1))));
    const hx = pad + (idx * plotW) / Math.max(1, series.length - 1);
    setHover({ idx, x: hx });
  };

  const hoverY = hover
    ? (max === min ? height / 2 : 2 + (height - 4) - ((series[hover.idx] - min) / (max - min)) * (height - 4))
    : 0;

  return (
    <div
      ref={ref}
      style={{ width: "100%", height, position: "relative" }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={w} height={height} style={{ display: "block" }}>
        {style === "bar" && bars
          ? bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h}
                    fill="var(--chart-line)" opacity={hover?.idx === i ? 1 : (i === bars.length - 1 ? 0.9 : 0.75)} rx={1} />
            ))
          : (
            <>
              {style !== "line" && <path d={area} fill="var(--chart-fill)" />}
              {cmp && <path d={cmp.line} fill="none" stroke="var(--chart-line-2)" strokeWidth={1.25} strokeDasharray="3 3" />}
              <path d={line} fill="none" stroke="var(--chart-line)" strokeWidth={1.5} />
            </>
          )}

        {hover && style !== "bar" && (
          <>
            <line x1={hover.x} x2={hover.x} y1={0} y2={height}
                  stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3" opacity={0.35} />
            <circle cx={hover.x} cy={hoverY} r={3} fill="var(--bg)" stroke="var(--chart-line)" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hover.x - 50, 0), Math.max(0, w - 100)),
            bottom: height + 6,
            background: "var(--ink)",
            color: "var(--accent-ink)",
            padding: "4px 7px",
            borderRadius: 4,
            fontSize: 10,
            pointerEvents: "none",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.3px",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            zIndex: 10,
          }}
        >
          {labels?.[hover.idx] && (
            <span style={{ opacity: 0.6, marginRight: 6 }}>
              {labels[hover.idx]}
            </span>
          )}
          <strong style={{ fontWeight: 600 }}>{format(series[hover.idx])}</strong>
        </div>
      )}
    </div>
  );
}
