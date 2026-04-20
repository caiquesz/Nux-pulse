"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { seriesToPath, seriesToBars } from "@/lib/chart-utils";

type Props = {
  series: number[];
  height?: number;
  style?: "line" | "area" | "bar";
  compare?: number[];
};

export function Sparkline({ series, height = 36, style = "area", compare }: Props) {
  const [w, setW] = useState(120);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width={w} height={height} style={{ display: "block" }}>
        {style === "bar" && bars
          ? bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h}
                    fill="var(--chart-line)" opacity={i === bars.length - 1 ? 1 : 0.75} rx={1} />
            ))
          : (
            <>
              {style !== "line" && <path d={area} fill="var(--chart-fill)" />}
              {cmp && <path d={cmp.line} fill="none" stroke="var(--chart-line-2)" strokeWidth={1.25} strokeDasharray="3 3" />}
              <path d={line} fill="none" stroke="var(--chart-line)" strokeWidth={1.5} />
            </>
          )}
      </svg>
    </div>
  );
}
