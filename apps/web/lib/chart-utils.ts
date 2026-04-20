export function seriesToPath(series: number[], w: number, h: number, pad = 2) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const step = (w - pad * 2) / (series.length - 1);
  const y = (v: number) => pad + (h - pad * 2) - ((v - min) / span) * (h - pad * 2);
  let d = `M ${pad} ${y(series[0])}`;
  for (let i = 1; i < series.length; i++) {
    d += ` L ${pad + i * step} ${y(series[i])}`;
  }
  return { line: d, area: d + ` L ${pad + (series.length - 1) * step} ${h - pad} L ${pad} ${h - pad} Z` };
}

export function seriesToBars(series: number[], w: number, h: number, gap = 2) {
  const max = Math.max(...series);
  const bw = (w - gap * (series.length - 1)) / series.length;
  return series.map((v, i) => ({
    x: i * (bw + gap),
    y: h - (v / max) * h,
    w: bw,
    h: (v / max) * h,
  }));
}

export function formatShort(v: number, full = false): string {
  if (full) return "R$ " + Math.round(v).toLocaleString("pt-BR");
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(v < 10 ? 1 : 0);
}
