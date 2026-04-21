"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { BigChart } from "@/components/primitives/BigChart";
import { NuxBars } from "@/components/icons/Icon";
import {
  getClient, metaAlerts, metaCampaigns, metaDaily, metaFunnel, metaOverview,
} from "@/lib/api";
import { fmtBRL, fmtInt, fmtIntCompact, fmtPct } from "@/lib/fmt";

export default function ReportsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);

  const client   = useQuery({ queryKey: ["client", slug],           queryFn: () => getClient(slug),           enabled: !!slug });
  const overview = useQuery({ queryKey: ["report-ov", slug, days],  queryFn: () => metaOverview(slug, { days }),  enabled: !!slug });
  const daily    = useQuery({ queryKey: ["report-dy", slug, days],  queryFn: () => metaDaily(slug, { days }),     enabled: !!slug });
  const campaigns= useQuery({ queryKey: ["report-cp", slug, days],  queryFn: () => metaCampaigns(slug, { days }), enabled: !!slug });
  const funnel   = useQuery({ queryKey: ["report-fn", slug, days],  queryFn: () => metaFunnel(slug, { days }),    enabled: !!slug });
  const alerts   = useQuery({ queryKey: ["report-al", slug],        queryFn: () => metaAlerts(slug),              enabled: !!slug });

  const now = new Date();
  const ov = overview.data;
  const fn  = funnel.data?.stages ?? [];
  const series = daily.data?.series ?? [];
  const clientName = client.data?.name ?? slug;

  // ── Derivações narrativas ─────────────────────────────────────────────
  const primaryConversion = useMemo(() => {
    if (!ov) return null;
    // Escolhe a conversão principal com base no volume — define o foco da copy
    if (ov.purchases > 0) return { key: "purchases", label: "compra", plural: "compras", value: ov.purchases, cost: ov.cost_per_purchase };
    if (ov.leads > 0)     return { key: "leads",     label: "lead",   plural: "leads",   value: ov.leads,     cost: ov.cost_per_lead };
    if (ov.messages > 0)  return { key: "messages",  label: "conversa", plural: "conversas no WhatsApp", value: ov.messages, cost: ov.cost_per_message };
    return null;
  }, [ov]);

  const bestDay = useMemo(() => {
    if (!series.length) return null;
    return series.reduce((best, s) => {
      const current = (s as { spend: number }).spend;
      return current > best.spend ? (s as { date: string; spend: number }) : best;
    }, series[0] as { date: string; spend: number });
  }, [series]);

  const spendSeries = useMemo(() => series.map((s) => s.spend), [series]);
  const convSeries = useMemo(() => {
    if (!primaryConversion) return [];
    const k = primaryConversion.key as "purchases" | "leads" | "messages";
    return series.map((s) => Number(s[k] ?? 0));
  }, [series, primaryConversion]);
  const dateLabels = useMemo(() => series.map((s) => s.date.slice(5).replace("-", "/")), [series]);

  // Deltas vs. período anterior — vêm do overview (já calculados no backend)
  const convKey = (primaryConversion?.key ?? "purchases") as "purchases" | "leads" | "messages";
  const deltaConv = ov?.deltas?.[convKey] ?? null;
  const deltaSpend = ov?.deltas?.spend ?? null;

  const acctAlerts = (alerts.data?.alerts ?? []).filter((a) => a.severity !== "info").slice(0, 3);

  const heroAccent = client.data?.accent_color || "oklch(0.72 0.19 55)"; // citrus default

  return (
    <>
      <div className="page-head no-print">
        <div>
          <div className="meta">12 — RELATÓRIOS</div>
          <h1>Relatório de performance</h1>
          <div className="sub">Documento pronto pra enviar ao cliente · Ctrl+P exporta PDF</div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
          <button className="btn" onClick={() => window.print()}>Exportar PDF</button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DOCUMENTO IMPRIMÍVEL
          Max width 860 — formato A4 friendly. Dark hero + light body.
         ═══════════════════════════════════════════════════════════════ */}
      <div className="report-doc" style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 0 }}>

        {/* ── HERO (capa) ─────────────────────────────────────────── */}
        <section
          className="report-hero"
          style={{
            background: "#0B0B0A",
            color: "#F5F2EB",
            padding: "56px 48px 48px",
            borderRadius: "16px 16px 0 0",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              background: `radial-gradient(600px circle at 85% 20%, ${heroAccent}26, transparent 60%)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,242,235,0.5)" }}>
              Relatório · Performance
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(245,242,235,0.8)" }}>
              <NuxBars size="sm" />
              <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>NUX PULSE</span>
            </div>
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 10 }}>
            {clientName}
          </h1>
          <div className="mono" style={{ fontSize: 12, color: "rgba(245,242,235,0.55)", letterSpacing: "0.04em" }}>
            Últimos {days} dias · Gerado em {now.toLocaleDateString("pt-BR")} às {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>

          {/* Frase-resumo — a history em 1 linha */}
          {ov && primaryConversion && (
            <div style={{ marginTop: 36, fontSize: 20, lineHeight: 1.5, maxWidth: 640, color: "rgba(245,242,235,0.92)", fontWeight: 400 }}>
              Nesse período investimos{" "}
              <strong style={{ color: heroAccent, fontWeight: 600 }}>{fmtBRL(ov.spend)}</strong>
              {" "}gerando{" "}
              <strong style={{ color: heroAccent, fontWeight: 600 }}>
                {fmtInt(primaryConversion.value)} {primaryConversion.value === 1 ? primaryConversion.label : primaryConversion.plural}
              </strong>
              {" "}a um custo médio de{" "}
              <strong style={{ color: heroAccent, fontWeight: 600 }}>{fmtBRL(primaryConversion.cost)}</strong> cada
              {typeof deltaConv === "number" && deltaConv !== 0 && (
                <> — <span style={{ color: deltaConv > 0 ? "oklch(0.75 0.20 140)" : "oklch(0.68 0.18 28)" }}>
                  {deltaConv > 0 ? "+" : ""}{deltaConv.toFixed(0)}% vs. período anterior
                </span></>
              )}.
            </div>
          )}
          {ov && !primaryConversion && (
            <div style={{ marginTop: 36, fontSize: 20, lineHeight: 1.5, color: "rgba(245,242,235,0.92)" }}>
              Nesse período investimos <strong style={{ color: heroAccent }}>{fmtBRL(ov.spend)}</strong>{" "}
              alcançando <strong style={{ color: heroAccent }}>{fmtIntCompact(ov.reach ?? 0)}</strong> pessoas
              com <strong style={{ color: heroAccent }}>{fmtIntCompact(ov.impressions)}</strong> impressões.
            </div>
          )}
        </section>

        {/* ── CORPO ─────────────────────────────────────────────────── */}
        <div style={{
          background: "var(--surface)",
          padding: "40px 48px 48px",
          borderRadius: "0 0 16px 16px",
          border: "1px solid var(--border)",
          borderTop: "none",
          display: "grid", gap: 40,
        }}>

          {/* ── RESUMO EXECUTIVO ──────────────────────────────────── */}
          {ov && (
            <section>
              <SectionHeader num="01" title="Resumo executivo" subtitle="O que aconteceu, em 3 pontos" />
              <div style={{ display: "grid", gap: 12 }}>
                <SummaryBullet
                  kind={(deltaSpend ?? 0) >= 0 ? "pos" : "warn"}
                  title={`Investimento ${(deltaSpend ?? 0) >= 0 ? "seguiu o plano" : "abaixo do esperado"}`}
                  body={`Foram ${fmtBRL(ov.spend)} distribuídos em ${campaigns.data?.campaigns.length ?? 0} campanhas${typeof deltaSpend === "number" ? `, ${Math.abs(deltaSpend).toFixed(0)}% ${deltaSpend >= 0 ? "acima" : "abaixo"} do período anterior` : ""}.`}
                />
                {primaryConversion && (
                  <SummaryBullet
                    kind={typeof deltaConv === "number" && deltaConv < 0 ? "neg" : "pos"}
                    title={`${primaryConversion.value} ${primaryConversion.value === 1 ? primaryConversion.label : primaryConversion.plural} geradas`}
                    body={`A um custo médio de ${fmtBRL(primaryConversion.cost)} cada${typeof deltaConv === "number" ? ` — ${deltaConv >= 0 ? "alta" : "queda"} de ${Math.abs(deltaConv).toFixed(0)}% vs. período anterior` : ""}.`}
                  />
                )}
                {acctAlerts.length > 0 ? (
                  <SummaryBullet
                    kind="warn"
                    title="Pontos de atenção detectados"
                    body={acctAlerts.map((a) => a.message).join(" · ")}
                  />
                ) : (
                  <SummaryBullet
                    kind="info"
                    title="Sem alertas críticos no período"
                    body="Nenhuma campanha apresentou queda de CTR, spike de CPC ou estouro de orçamento."
                  />
                )}
              </div>
            </section>
          )}

          {/* ── KPIs QUE IMPORTAM (4) ─────────────────────────────── */}
          {ov && (
            <section>
              <SectionHeader num="02" title="Números que importam" subtitle="As 4 métricas principais" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <BigKpi label="Investimento" value={fmtBRL(ov.spend)} delta={deltaSpend ?? null} inverse />
                <BigKpi
                  label={primaryConversion?.plural ?? "Conversões"}
                  value={primaryConversion ? fmtInt(primaryConversion.value) : "—"}
                  delta={typeof deltaConv === "number" ? deltaConv : null}
                />
                <BigKpi
                  label={primaryConversion ? `Custo por ${primaryConversion.label}` : "Custo por clique"}
                  value={primaryConversion ? fmtBRL(primaryConversion.cost) : fmtBRL(ov.cpc)}
                  delta={null}
                  hint="quanto cada resultado custou"
                />
                <BigKpi
                  label={ov.roas > 0 ? "ROAS" : "Alcance"}
                  value={ov.roas > 0 ? `${ov.roas.toFixed(2)}x` : fmtIntCompact(ov.reach ?? 0)}
                  delta={null}
                  hint={ov.roas > 0 ? "retorno por real investido" : "pessoas únicas impactadas"}
                />
              </div>
            </section>
          )}

          {/* ── TENDÊNCIA (1 gráfico) ───────────────────────────────── */}
          {series.length > 1 && (
            <section>
              <SectionHeader
                num="03"
                title="Tendência diária"
                subtitle={primaryConversion ? `Investimento vs. ${primaryConversion.plural.toLowerCase()} ao longo dos ${days} dias` : `Investimento ao longo dos ${days} dias`}
              />
              {/* Paleta profissional (pronta pra PDF):
                  - Linha principal: navy profundo (oklch 0.38 0.10 250) — sóbrio, imprime bem
                  - Compara: terracota queimada — contraste quente sem ser gritante  */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12, padding: 20,
              }}>
                {/* Legenda */}
                <div style={{
                  display: "flex", gap: 24, marginBottom: 16, fontSize: 11,
                  fontFamily: "var(--font-mono)", color: "var(--ink-2)", letterSpacing: 0.3,
                  textTransform: "uppercase", fontWeight: 600,
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 16, height: 3, background: "oklch(0.38 0.10 250)", borderRadius: 1 }} />
                    Investimento <span style={{ color: "var(--ink-4)", fontWeight: 400, textTransform: "none" }}>(eixo esquerdo)</span>
                  </span>
                  {primaryConversion && convSeries.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 16, height: 2, background: "repeating-linear-gradient(90deg, oklch(0.52 0.16 35) 0 5px, transparent 5px 9px)" }} />
                      {primaryConversion.plural} <span style={{ color: "var(--ink-4)", fontWeight: 400, textTransform: "none" }}>(eixo direito)</span>
                    </span>
                  )}
                </div>

                <BigChart
                  series={spendSeries}
                  compare={primaryConversion ? convSeries : undefined}
                  labels={dateLabels}
                  seriesLabel="Investimento"
                  seriesFormat={(v) => fmtBRL(v)}
                  compareLabel={primaryConversion?.plural}
                  compareFormat={(v) => Math.round(v).toLocaleString("pt-BR")}
                  height={240}
                  lineColor="oklch(0.38 0.10 250)"
                  fillColor="oklch(0.38 0.10 250 / 0.10)"
                  compareColor="oklch(0.52 0.16 35)"
                  axisColor="var(--ink-3)"
                  gridColor="var(--border)"
                />

                {/* Stats row — legível em PDF, sem precisar de hover */}
                {(() => {
                  const n = series.length;
                  const totalSpend = series.reduce((s, p) => s + p.spend, 0);
                  const avgSpend = n > 0 ? totalSpend / n : 0;
                  const peak = series.reduce((m, s) => (s.spend > m.spend ? s : m), series[0]);
                  const totalConv = primaryConversion
                    ? series.reduce((s, p) => s + Number(p[convKey] ?? 0), 0)
                    : 0;
                  const daysWithConv = primaryConversion
                    ? series.filter((p) => Number(p[convKey] ?? 0) > 0).length
                    : 0;
                  return (
                    <div style={{
                      marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)",
                      display: "grid", gridTemplateColumns: primaryConversion ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
                      gap: 20,
                    }}>
                      <MiniStat label="Investimento médio/dia" value={fmtBRL(avgSpend)} />
                      <MiniStat
                        label="Maior investimento"
                        value={fmtBRL(peak.spend)}
                        hint={peak.date.split("-").reverse().join("/")}
                      />
                      {primaryConversion && (
                        <>
                          <MiniStat
                            label={`${primaryConversion.plural} por dia`}
                            value={(totalConv / Math.max(1, n)).toFixed(1).replace(".", ",")}
                            hint={`${totalConv} no total`}
                          />
                          <MiniStat
                            label="Dias com resultado"
                            value={`${daysWithConv} de ${n}`}
                            hint={`${((daysWithConv / Math.max(1, n)) * 100).toFixed(0)}% dos dias`}
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </section>
          )}

          {/* ── FUNIL (se tiver compras ou leads) ──────────────── */}
          {fn.length > 0 && fn.some((s) => s.value > 0) && (
            <section>
              <SectionHeader num="04" title="Funil de conversão" subtitle="Do impacto à ação" />
              <div style={{ display: "grid", gap: 4, background: "var(--surface-2)", padding: 18, borderRadius: 12 }}>
                {fn.map((s, i) => {
                  const top = fn[0]?.value || 1;
                  const pct = (s.value / top) * 100;
                  return (
                    <div key={s.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px", gap: 12, alignItems: "center", padding: "8px 0" }}>
                      <div style={{ fontSize: 12, fontWeight: i === 0 ? 600 : 500, color: s.value > 0 ? "var(--ink)" : "var(--ink-4)" }}>
                        {s.label}
                      </div>
                      <div style={{ height: 16, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          width: `${Math.max(2, pct)}%`, height: "100%",
                          background: i === 0 ? "var(--hero)" : "var(--chart-line)",
                          opacity: 1 - i * 0.12,
                        }} />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {fmtInt(s.value)}
                        </span>
                        {s.conversion_from_prev != null && s.conversion_from_prev > 0 && (
                          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 6 }}>
                            ({s.conversion_from_prev.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── APÊNDICE técnico ──────────────────────────────────── */}
          {ov && (
            <section>
              <SectionHeader num="05" title="Apêndice" subtitle="Métricas técnicas complementares" />
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2,
                background: "var(--border)", border: "1px solid var(--border)",
                borderRadius: 10, overflow: "hidden",
              }}>
                <Tiny label="Impressões"  value={fmtIntCompact(ov.impressions)} />
                <Tiny label="Alcance"     value={fmtIntCompact(ov.reach ?? 0)} />
                <Tiny label="Cliques"     value={fmtIntCompact(ov.clicks)} />
                <Tiny label="CTR médio"   value={fmtPct(ov.ctr)} hint="cliques ÷ impressões" />
                <Tiny label="CPC médio"   value={fmtBRL(ov.cpc)} hint="custo por clique" />
                <Tiny label="Frequência"  value="—" hint="média de vezes que cada pessoa viu o anúncio" />
              </div>
            </section>
          )}

          {/* ── RODAPÉ ─────────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.5 }}>
              NUX PULSE · {now.toISOString().slice(0, 10)}
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-4)", textAlign: "right", maxWidth: 340 }}>
              Dados extraídos da Meta Marketing API. Eventual divergência com o Ads Manager pode ocorrer por atribuição e fuso horário da conta.
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print, .app-sidebar, .app-topbar, nav, .sb-badge { display: none !important; }
          body, .app-main { background: white !important; }
          .report-doc { border: none !important; padding: 0 !important; max-width: 100% !important; margin: 0 !important; }
          .report-hero { border-radius: 0 !important; }
          section { break-inside: avoid; }
          .report-doc > div:last-child { border-radius: 0 !important; border: none !important; }
        }
      `}</style>
    </>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────

function SectionHeader({ num, title, subtitle }: { num: string; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 1.2, fontWeight: 600 }}>
          {num}
        </span>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em" }}>{title}</h2>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{subtitle}</div>
    </div>
  );
}

function SummaryBullet({ kind, title, body }: { kind: "pos" | "neg" | "warn" | "info"; title: string; body: string }) {
  const borderColor = kind === "pos" ? "var(--pos)" : kind === "neg" ? "var(--neg)" : kind === "warn" ? "var(--warn)" : "var(--info)";
  return (
    <div style={{
      padding: "14px 18px", background: "var(--surface-2)", borderRadius: 8,
      borderLeft: `3px solid ${borderColor}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function BigKpi({
  label, value, delta, hint, inverse = false,
}: { label: string; value: string; delta: number | null; hint?: string; inverse?: boolean }) {
  // delta > 0 é "bom" por padrão (mais conversões). Se `inverse`, ex: custo, inverte a cor.
  const deltaPositive = delta != null && ((delta > 0 && !inverse) || (delta < 0 && inverse));
  return (
    <div style={{ padding: "18px 16px", background: "var(--surface-2)", borderRadius: 10 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-3)", minHeight: 14 }}>
        {delta != null ? (
          <span style={{ color: deltaPositive ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : (
          <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>{hint ?? ""}</span>
        )}
        {delta != null && <span style={{ color: "var(--ink-4)", marginLeft: 6 }}>vs. anterior</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
        {value}
      </div>
      {hint && (
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

function Tiny({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ padding: "14px 16px", background: "var(--surface)" }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
