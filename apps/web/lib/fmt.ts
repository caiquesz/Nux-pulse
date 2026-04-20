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

export function fmtRatio(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",") + "x";
}

export function delta(now: number, prev: number): number {
  if (!prev) return 0;
  return ((now - prev) / prev) * 100;
}
