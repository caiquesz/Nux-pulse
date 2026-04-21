"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { getClient, metaCampaigns, metaDaily, metaFunnel, metaOverview } from "@/lib/api";
import { fmtBRL, fmtInt, fmtIntCompact, fmtPct } from "@/lib/fmt";

export default function ReportsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);

  const client = useQuery({ queryKey: ["client", slug], queryFn: () => getClient(slug), enabled: !!slug });
  const overview = useQuery({ queryKey: ["report-ov", slug, days], queryFn: () => metaOverview(slug, { days }), enabled: !!slug });
  const daily = useQuery({ queryKey: ["report-dy", slug, days], queryFn: () => metaDaily(slug, { days }), enabled: !!slug });
  const campaigns = useQuery({ queryKey: ["report-cp", slug, days], queryFn: () => metaCampaigns(slug, { days }), enabled: !!slug });
  const funnel = useQuery({ queryKey: ["report-fn", slug, days], queryFn: () => metaFunnel(slug, { days }), enabled: !!slug });

  const now = new Date();
  const ov = overview.data;
  const cps = (campaigns.data?.campaigns ?? []).slice(0, 10);
  const fn = funnel.data?.stages ?? [];
  const series = daily.data?.series ?? [];
  const topSpendDay = series.reduce((m, s) => (s.spend > m ? s.spend : m), 0);

  return (
    <>
      <div className="page-head no-print">
        <div>
          <div className="meta">12 — RELATÓRIOS</div>
          <h1>Relatório de performance</h1>
          <div className="sub">Visão consolidada · printável em PDF (Ctrl+P)</div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
          <button className="btn" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>

      <div className="report-doc" style={{
        background: "var(--surface)", padding: 40, borderRadius: 12,
        border: "1px solid var(--border)",
        display: "grid", gap: 32, maxWidth: 960,
      }}>
        {/* Cabeçalho do doc */}
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 1 }}>
            Relatório · NUX Pulse
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{client.data?.name ?? slug}</h2>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            Período: últimos {days} dias · gerado em {now.toLocaleDateString("pt-BR")} às {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        {/* KPIs */}
        <section>
          <h3 style={sectionH}>Resultado do período · Meta Ads</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <Stat label="Investimento" value={fmtBRL(ov?.spend ?? 0)} />
            <Stat label="Impressões" value={fmtIntCompact(ov?.impressions ?? 0)} />
            <Stat label="Cliques" value={fmtIntCompact(ov?.clicks ?? 0)} />
            <Stat label="Alcance" value={fmtIntCompact(ov?.reach ?? 0)} />
            <Stat label="CTR médio" value={fmtPct(ov?.ctr ?? 0)} />
            <Stat label="CPC médio" value={fmtBRL(ov?.cpc ?? 0)} />
          </div>
        </section>

        {/* Top campanhas */}
        <section>
          <h3 style={sectionH}>Top campanhas por investimento</h3>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase" }}>
                <th style={th}>Campanha</th>
                <th style={{ ...th, textAlign: "right" }}>Investido</th>
                <th style={{ ...th, textAlign: "right" }}>Impr.</th>
                <th style={{ ...th, textAlign: "right" }}>Cliques</th>
                <th style={{ ...th, textAlign: "right" }}>CTR</th>
                <th style={{ ...th, textAlign: "right" }}>CPC</th>
              </tr>
            </thead>
            <tbody>
              {cps.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>{c.name}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(c.spend)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtIntCompact(c.impressions)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtIntCompact(c.clicks)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(c.ctr)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(c.cpc)}</td>
                </tr>
              ))}
              {cps.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, color: "var(--ink-4)", textAlign: "center", padding: 20 }}>Sem dados.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Evolução diária */}
        {series.length > 0 && (
          <section>
            <h3 style={sectionH}>Evolução diária do investimento</h3>
            <div style={{ display: "grid", gap: 3 }}>
              {series.map((s) => (
                <div key={s.date} style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px", gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{s.date}</span>
                  <div style={{ height: 10, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${topSpendDay > 0 ? (s.spend / topSpendDay) * 100 : 0}%`, height: "100%", background: "var(--hero)" }} />
                  </div>
                  <span style={{ fontSize: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtBRL(s.spend)} · {fmtInt(s.clicks)} clk
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Funil */}
        {fn.length > 0 && fn[0].value > 0 && (
          <section>
            <h3 style={sectionH}>Funil de conversão</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {fn.map((s) => (
                <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12 }}>{s.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 600 }}>
                    {fmtInt(s.value)}
                    {s.conversion_from_prev != null && (
                      <span style={{ color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({fmtPct(s.conversion_from_prev)})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, fontSize: 10, color: "var(--ink-4)" }}>
          Dados extraídos do Meta Marketing API via NUX Pulse · {now.toISOString()}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print, .app-sidebar, .app-topbar, nav, .sb-badge { display: none !important; }
          body, .app-main { background: white !important; color: black !important; }
          .report-doc { border: none !important; padding: 0 !important; max-width: 100% !important; }
          section { break-inside: avoid; }
        }
      `}</style>
    </>
  );
}

const sectionH: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, marginBottom: 12,
  textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-2)",
};
const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 8px" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--surface-2)", borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{value}</div>
    </div>
  );
}
