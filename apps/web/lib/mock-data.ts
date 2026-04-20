// ═══ Mock data portado de design-ref/id-nux/nux-pulse/data.js ═══
// Será substituído por chamadas à API na Fase 2.

export type Account = { id: string; name: string; platform: string; accent?: string };

export const ACCOUNTS: Account[] = [
  { id: "all",   name: "Todas as contas", platform: "all",         accent: "#0D0D0D" },
  { id: "comtex", name: "COMTEX",         platform: "meta+google", accent: "#8A5A3B" },
  { id: "acme",  name: "ACME Retail",     platform: "meta+google", accent: "#3B6E8A" },
  { id: "lumen", name: "Lumen Studio",    platform: "meta",        accent: "#5A3B8A" },
  { id: "verdi", name: "Verdi Foods",     platform: "google",      accent: "#3B8A5A" },
  { id: "porto", name: "Porto Imóveis",   platform: "meta+google", accent: "#8A3B3B" },
];

export type Kpi = { label: string; value: string; unit: string; delta: number; series: number[] };

function genSeries(n: number, base: number, variance: number, trend: "up" | "down" | "flat" = "up"): number[] {
  const out: number[] = [];
  const dir = trend === "up" ? 1 : trend === "down" ? -1 : 0;
  for (let i = 0; i < n; i++) {
    const noise = (Math.sin(i * 0.7 + base) + Math.cos(i * 0.3)) * 0.5;
    const v = base * (1 + dir * (i / n) * variance) + noise * base * variance * 0.6;
    out.push(Math.max(0, v));
  }
  return out;
}

export const KPIS: Kpi[] = [
  { label: "Investimento",     value: "R$ 184.240", unit: "BRL",   delta: +12.4, series: genSeries(30, 6000, 0.22, "up") },
  { label: "Receita atribuída",value: "R$ 912.408", unit: "BRL",   delta: +18.1, series: genSeries(30, 28000, 0.18, "up") },
  { label: "ROAS médio",       value: "4.95x",      unit: "ratio", delta: +5.1,  series: genSeries(30, 4.6, 0.08, "up") },
  { label: "CPA blended",      value: "R$ 42.10",   unit: "BRL",   delta: -3.8,  series: genSeries(30, 45, 0.12, "down") },
  { label: "Conversões",       value: "4.378",      unit: "n",     delta: +9.6,  series: genSeries(30, 140, 0.15, "up") },
  { label: "CTR",              value: "2.84%",      unit: "pct",   delta: +0.3,  series: genSeries(30, 2.7, 0.05, "up") },
];

export const CAMPAIGNS = [
  { status:"on",  plat:"meta",   name:"ACME — Remarketing DPA Q2",        bud:"R$ 1.200/d", spend:"R$ 38.412", rev:"R$ 214.880", roas:"5.59x", cpa:"R$ 31.20", ctr:"3.2%", imp:"1.2M", delta:+22.4 },
  { status:"on",  plat:"google", name:"ACME — Performance Max Core",       bud:"R$ 2.000/d", spend:"R$ 54.120", rev:"R$ 248.344", roas:"4.59x", cpa:"R$ 38.90", ctr:"1.9%", imp:"2.8M", delta:+11.2 },
  { status:"on",  plat:"meta",   name:"Lumen — Launch Reels Video",        bud:"R$ 900/d",   spend:"R$ 22.388", rev:"R$ 98.422",  roas:"4.40x", cpa:"R$ 44.10", ctr:"2.6%", imp:"880K", delta:+6.1  },
  { status:"warn",plat:"google", name:"Verdi — Search Brand",              bud:"R$ 450/d",   spend:"R$ 12.880", rev:"R$ 34.210",  roas:"2.66x", cpa:"R$ 58.80", ctr:"6.1%", imp:"140K", delta:-4.2  },
  { status:"on",  plat:"meta",   name:"Porto — Leads Imóveis Alto Padrão", bud:"R$ 1.500/d", spend:"R$ 29.110", rev:"R$ 118.440", roas:"4.07x", cpa:"R$ 78.20", ctr:"1.8%", imp:"620K", delta:+14.0 },
  { status:"off", plat:"meta",   name:"ACME — Teste Carrossel Agosto",     bud:"R$ 400/d",   spend:"R$ 8.240",  rev:"R$ 12.800",  roas:"1.55x", cpa:"R$ 112.00",ctr:"0.9%", imp:"210K", delta:-18.4 },
] as const;
