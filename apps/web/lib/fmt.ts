// Formatação pt-BR para números, moedas e variações.

export function fmtBRL(v: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    if (Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toFixed(1).replace(".", ",") + "M";
    if (Math.abs(v) >= 1e3) return "R$ " + (v / 1e3).toFixed(1).replace(".", ",") + "K";
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtInt(v: number): string {
  return v.toLocaleString("pt-BR");
}

export function fmtIntCompact(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(".", ",") + "K";
  return fmtInt(v);
}

export function fmtPct(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",") + "%";
}

// Como fmtPct, mas escolhe a precisão pra não esconder valores pequenos
// (ex.: 0,013% não vira "0,01%" e 0,001% não vira "0,00%").
export function fmtPctAdaptive(v: number): string {
  const abs = Math.abs(v);
  if (abs > 0 && abs < 0.01) return fmtPct(v, 4);
  if (abs > 0 && abs < 0.1)  return fmtPct(v, 3);
  if (abs >= 100)            return fmtPct(v, 0);
  return fmtPct(v, 2);
}

export function fmtRatio(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",") + "x";
}

export function delta(now: number, prev: number): number {
  if (!prev) return 0;
  return ((now - prev) / prev) * 100;
}
