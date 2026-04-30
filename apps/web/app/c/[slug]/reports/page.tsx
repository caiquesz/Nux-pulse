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
    // Compras canônicas = manual_conversions (Trackcore + UI manual). Evita
    // conflito entre Visão geral / Funil / Reports.
    const canonicalPurchases = ov.manual_purchases ?? 0;
    const canonicalCpp = canonicalPurchases > 0 ? ov.spend / canonicalPurchases : 0;
    if (canonicalPurchases > 0) return { key: "purchases", label: "compra", plural: "compras", value: canonicalPurchases, cost: canonicalCpp };
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

        {/* ── HERO (capa) ─────────────────────────────────────────────
             Estetica editorial: bg preto profundo, accent so como hairline
             vertical e em UM numero-chave da frase-resumo. Sem gradiente
             colorido — o respiro vem da tipografia e do espacamento. */}
        <section
          className="report-hero"
          style={{
            background: "#0A0A09",
            color: "#F5F2EB",
            padding: "64px 56px 56px",
            borderRadius: "16px 16px 0 0",
            position: "relative",
            overflow: "hidden",
            borderBottom: `1px solid ${heroAccent}`,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(800px circle at 90% -10%, rgba(255,255,255,0.045), transparent 55%)",
              pointerEvents: "none",
            }}
          />
          {/* Top bar: assinatura NUX a esquerda, marker do relatorio a direita */}
          <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 56 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "rgba(245,242,235,0.75)" }}>
              <NuxBars size="sm" />
              <span className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", fontWeight: 600 }}>NUX PULSE</span>
            </div>
            <div className="mono" style={{
              fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase",
              color: "rgba(245,242,235,0.42)", fontWeight: 600,
              padding: "5px 10px", border: "1px solid rgba(245,242,235,0.14)",
              borderRadius: 999,
            }}>
              Relatório · Performance
            </div>
          </div>

          {/* Titulo do cliente em escala editorial */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="mono" style={{
              fontSize: 10, color: "rgba(245,242,235,0.45)",
              letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600,
              marginBottom: 14,
            }}>
              Cliente
            </div>
            <h1 style={{
              fontSize: 56, fontWeight: 700, letterSpacing: "-0.025em",
              lineHeight: 0.98, marginBottom: 14, color: "#F5F2EB",
            }}>
              {clientName}
            </h1>
            <div className="mono" style={{
              fontSize: 11.5, color: "rgba(245,242,235,0.55)",
              letterSpacing: "0.06em", fontWeight: 500,
            }}>
              Últimos {days} dias · Gerado em {now.toLocaleDateString("pt-BR")} às {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          {/* Frase-resumo — narrativa editorial. Apenas o numero-chave em accent. */}
          {ov && primaryConversion && (
            <div style={{
              position: "relative", zIndex: 1,
              marginTop: 56, fontSize: 19, lineHeight: 1.55, maxWidth: 660,
              color: "rgba(245,242,235,0.92)", fontWeight: 400,
            }}>
              Nesse período investimos{" "}
              <strong style={{ color: "#F5F2EB", fontWeight: 600 }}>{fmtBRL(ov.spend)}</strong>
              {" "}e geramos{" "}
              <strong style={{ color: heroAccent, fontWeight: 700 }}>
                {fmtInt(primaryConversion.value)} {primaryConversion.value === 1 ? primaryConversion.label : primaryConversion.plural}
              </strong>
              {" "}a um custo médio de{" "}
              <strong style={{ color: "#F5F2EB", fontWeight: 600 }}>{fmtBRL(primaryConversion.cost)}</strong> cada
              {typeof deltaConv === "number" && deltaConv !== 0 && (
                <>, <span style={{ color: deltaConv > 0 ? "rgba(165,210,170,0.95)" : "rgba(225,165,160,0.95)", fontWeight: 500 }}>
                  {deltaConv > 0 ? "uma alta" : "uma queda"} de {Math.abs(deltaConv).toFixed(0)}% vs. o período anterior
                </span></>
              )}.
            </div>
          )}
          {ov && !primaryConversion && (
            <div style={{
              position: "relative", zIndex: 1,
              marginTop: 56, fontSize: 19, lineHeight: 1.55, maxWidth: 660,
              color: "rgba(245,242,235,0.92)",
            }}>
              Nesse período investimos <strong style={{ color: "#F5F2EB", fontWeight: 600 }}>{fmtBRL(ov.spend)}</strong>{" "}
              alcançando <strong style={{ color: heroAccent, fontWeight: 700 }}>{fmtIntCompact(ov.reach ?? 0)}</strong> pessoas
              com <strong style={{ color: "#F5F2EB", fontWeight: 600 }}>{fmtIntCompact(ov.impressions)}</strong> impressões.
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
              <div style={{
                display: "grid",
                // Forca 4-em-linha em desktop A4-friendly; cai pra 2 em mobile.
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 1,
                background: "var(--border)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}>
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
            <section className="report-page-break-before">
              <SectionHeader
                num="03"
                title="Tendência diária"
                subtitle={primaryConversion ? `Investimento vs. ${primaryConversion.plural.toLowerCase()} ao longo dos ${days} dias` : `Investimento ao longo dos ${days} dias`}
              />
              {/* Paleta editorial: investimento em accent (--hero), conversoes
                  em ink-2 (cream claro). Evita 2 cores saturadas competindo
                  e mantem hierarquia limpa em dark mode. */}
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
                  flexWrap: "wrap",
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 16, height: 3, background: "var(--hero)", borderRadius: 1 }} />
                    Investimento <span style={{ color: "var(--ink-4)", fontWeight: 400, textTransform: "none" }}>(eixo esquerdo)</span>
                  </span>
                  {primaryConversion && convSeries.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 16, height: 3, background: "var(--ink-2)", borderRadius: 1 }} />
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
                  lineColor="var(--hero)"
                  fillColor="oklch(0.74 0.20 50 / 0.14)"
                  compareColor="var(--ink-2)"
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
                      display: "grid", gridTemplateColumns: primaryConversion
                        ? "repeat(auto-fit, minmax(180px, 1fr))"
                        : "repeat(auto-fit, minmax(220px, 1fr))",
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
            <section className="report-page-break-before">
              <SectionHeader num="04" title="Funil de conversão" subtitle="Do impacto à ação" />
              <div style={{ background: "var(--surface-2)", padding: 22, borderRadius: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  {fn.map((s, i) => {
                    const top = fn[0]?.value || 1;
                    const pct = (s.value / top) * 100;
                    // % do estagio anterior. Acima de 100% indica mistura de fontes
                    // (ex: compras canonical vem de manual_conversions, checkout vem
                    // do pixel) — esconder pra nao confundir o cliente.
                    const conv = s.conversion_from_prev;
                    const showConv = conv != null && conv > 0 && conv <= 100;
                    return (
                      <div key={s.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr 130px", gap: 14, alignItems: "center", padding: "6px 0" }}>
                        <div style={{
                          fontSize: 12.5, fontWeight: i === 0 ? 600 : 500,
                          color: s.value > 0 ? "var(--ink)" : "var(--ink-4)",
                          letterSpacing: -0.1,
                        }}>
                          {s.label}
                        </div>
                        <div style={{ height: 14, background: "var(--surface-3)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.max(1.5, pct)}%`, height: "100%",
                            background: "var(--hero)",
                            // Opacity decai gradualmente do topo pro fundo do funil
                            opacity: 1 - i * 0.13,
                            transition: "width 300ms ease",
                          }} />
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span className="mono" style={{
                            fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                            color: s.value > 0 ? "var(--ink)" : "var(--ink-4)",
                          }}>
                            {fmtInt(s.value)}
                          </span>
                          {showConv && (
                            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 6 }}>
                              ({conv!.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Nota sobre fontes — transparencia profissional */}
                <div style={{
                  marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)",
                  fontSize: 10.5, color: "var(--ink-4)", lineHeight: 1.5,
                  fontFamily: "var(--font-mono)", letterSpacing: 0.2,
                }}>
                  Topo do funil (impressões → checkout) via Meta pixel. Compras refletem
                  vendas confirmadas via Trackcore + lançamentos manuais.
                </div>
              </div>
            </section>
          )}

          {/* ── APÊNDICE técnico ──────────────────────────────────── */}
          {ov && (
            <section>
              <SectionHeader num="05" title="Apêndice" subtitle="Métricas técnicas complementares" />
              <div style={{ display: "grid", gap: 18 }}>
                {/* Cobertura — quanto e quem foi atingido */}
                <div>
                  <div className="mono" style={{
                    fontSize: 9.5, color: "var(--ink-4)", letterSpacing: 1.4,
                    textTransform: "uppercase", fontWeight: 600, marginBottom: 8,
                  }}>
                    Cobertura
                  </div>
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1,
                    background: "var(--border)", border: "1px solid var(--border)",
                    borderRadius: 10, overflow: "hidden",
                  }}>
                    <Tiny label="Impressões"  value={fmtIntCompact(ov.impressions)} hint="exibições do anúncio" />
                    <Tiny label="Alcance"     value={fmtIntCompact(ov.reach ?? 0)} hint="pessoas únicas atingidas" />
                    <Tiny label="Cliques"     value={fmtIntCompact(ov.clicks)} hint="cliques no link do anúncio" />
                  </div>
                </div>

                {/* Performance — qualidade da entrega */}
                <div>
                  <div className="mono" style={{
                    fontSize: 9.5, color: "var(--ink-4)", letterSpacing: 1.4,
                    textTransform: "uppercase", fontWeight: 600, marginBottom: 8,
                  }}>
                    Performance
                  </div>
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1,
                    background: "var(--border)", border: "1px solid var(--border)",
                    borderRadius: 10, overflow: "hidden",
                  }}>
                    <Tiny label="CTR médio"   value={fmtPct(ov.ctr)} hint="cliques ÷ impressões" />
                    <Tiny label="CPC médio"   value={fmtBRL(ov.cpc)} hint="custo por clique" />
                    <Tiny label="Frequência"  value="—" hint="vezes que cada pessoa viu" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── RODAPÉ ─────────────────────────────────────────────── */}
          <div style={{
            marginTop: 8,
            borderTop: "1px solid var(--border)",
            paddingTop: 24,
            display: "flex", justifyContent: "space-between", alignItems: "flex-end",
            gap: 24, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <NuxBars size="sm" />
                <span className="mono" style={{
                  fontSize: 10.5, color: "var(--ink-2)", letterSpacing: "0.18em",
                  textTransform: "uppercase", fontWeight: 700,
                }}>
                  NUX Pulse
                </span>
              </div>
              <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: 0.4 }}>
                Performance · {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </div>
            </div>
            <div style={{
              fontSize: 10, color: "var(--ink-4)", textAlign: "right",
              maxWidth: 360, lineHeight: 1.55, fontStyle: "italic",
            }}>
              Dados extraídos da Meta Marketing API e do Trackcore. Eventual divergência
              com o Ads Manager pode ocorrer por janela de atribuição e fuso horário da conta.
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          /* ═══════════════════════════════════════════════════════════════
             RELATORIO PDF — DARK MODE END-TO-END
             Estrategia: nao flippar tema. O design black do screen e a
             estetica desejada — replica no PDF preservando cores inline e
             tokens dark. So escondemos chrome e ajustamos pra A4.
             ═══════════════════════════════════════════════════════════════ */

          /* 1. Preservar bg/cor de fundo no print (browsers default skip
                pra economizar tinta — print-color-adjust:exact desliga isso) */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            box-sizing: border-box !important;
          }

          /* 2. Esconder chrome: sidebar, topbar, header da pagina, action buttons */
          .sidebar, .topbar, .page-head, .no-print,
          .sb-badge, nav, aside.sidebar { display: none !important; }

          /* 3. RESET layout — sem height 100vh nem grid 240px da sidebar */
          html, body {
            background: #0A0A09 !important;
            color: #F5F2EB !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          .app, .app[data-sidebar] {
            background: #0A0A09 !important;
            display: block !important;
            grid-template-columns: 1fr !important;
            height: auto !important;
            overflow: visible !important;
          }
          .main, .page {
            background: #0A0A09 !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            overflow: visible !important;
          }

          /* 4. report-doc — fit A4 sem reset de bg/border (preserva o design dark) */
          .report-doc {
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            overflow: hidden !important;
            display: block !important;
          }
          /* O wrapper interno do corpo (logo apos o hero) tem bg --surface
             que no dark mode ja e #1a1a1a/proximo. So ajusta padding e remove
             radius que nao faz sentido em paper. */
          .report-doc > div:last-child {
            border-radius: 0 !important;
            padding: 32px 36px !important;
            gap: 28px !important;
          }

          /* 5. HERO — preserva tudo do screen, so reseta border-radius e
                garante page-break-after avoid. NAO mexer em padding/cores —
                inline styles sao a verdade. */
          .report-hero {
            border-radius: 0 !important;
            page-break-after: avoid !important;
          }

          /* 6. PAGE BREAKS — chart e funnel sempre em pagina nova */
          section.report-page-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }
          /* Pequenos blocos nao cortam ao meio */
          [class*="card"],
          section > div[style*="grid"],
          .grid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          /* Section pode dividir; subitens nao */
          section {
            break-inside: auto !important;
            page-break-inside: auto !important;
            margin-top: 0 !important;
          }

          /* 7. SVGs escalam pro container A4 */
          .report-doc svg {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
          }
          .report-doc > div:last-child [style*="position: relative"][style*="height"] {
            min-height: 220px !important;
          }

          /* 8. APENDICE/KPI grids — fit A4 strict, sem overflow direita */
          .report-doc [style*="grid-template-columns: repeat(3"],
          .report-doc [style*="grid-template-columns: repeat(4"] {
            width: 100% !important;
            max-width: 100% !important;
          }
          .report-doc [style*="grid"] > * {
            min-width: 0 !important;
            max-width: 100% !important;
          }
          .report-doc [style*="grid"] > * div {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }

          /* 9. FUNNEL labels — encolher pra caber em A4 */
          .report-doc [style*="grid-template-columns: 180px"] {
            grid-template-columns: 160px 1fr 110px !important;
            gap: 12px !important;
          }

          /* 10. @page A4 — margem zero (a capa preta vai borderless ate a borda
                 do papel; o body tem padding interno do report-doc).
                 Background dark precisa que o browser nao injete bg branco padrao. */
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────

function SectionHeader({ num, title, subtitle }: { num: string; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span className="mono" style={{
          fontSize: 11, color: "var(--ink-4)", letterSpacing: 1.4,
          fontWeight: 600, fontVariantNumeric: "tabular-nums",
        }}>
          {num}
        </span>
        <h2 style={{
          fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
          margin: 0, lineHeight: 1.15,
        }}>
          {title}
        </h2>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4, paddingLeft: 28 }}>
        {subtitle}
      </div>
    </div>
  );
}

function SummaryBullet({ kind, title, body }: { kind: "pos" | "neg" | "warn" | "info"; title: string; body: string }) {
  const accentColor =
    kind === "pos" ? "var(--pos)" :
    kind === "neg" ? "var(--neg)" :
    kind === "warn" ? "var(--warn)" :
    "var(--info)";
  const label =
    kind === "pos" ? "Positivo" :
    kind === "neg" ? "Atenção" :
    kind === "warn" ? "Observação" :
    "Informativo";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "3px 1fr", gap: 16,
      padding: "16px 18px 16px 14px",
      background: "var(--surface-2)",
      borderRadius: 8,
      alignItems: "stretch",
    }}>
      <div style={{ background: accentColor, borderRadius: 999 }} />
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span className="mono" style={{
            fontSize: 9, color: accentColor, letterSpacing: 1.2,
            textTransform: "uppercase", fontWeight: 700,
          }}>
            {label}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

function BigKpi({
  label, value, delta, hint, inverse = false,
}: { label: string; value: string; delta: number | null; hint?: string; inverse?: boolean }) {
  // delta > 0 é "bom" por padrão (mais conversões). Se `inverse`, ex: custo, inverte a cor.
  const deltaPositive = delta != null && ((delta > 0 && !inverse) || (delta < 0 && inverse));
  return (
    <div style={{ padding: "20px 18px 18px", background: "var(--surface)" }}>
      <div className="mono" style={{
        fontSize: 9.5, color: "var(--ink-4)", letterSpacing: 1.1,
        textTransform: "uppercase", fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, marginTop: 10,
        letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums",
        color: "var(--ink)", lineHeight: 1.05,
      }}>
        {value}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", minHeight: 14 }}>
        {delta != null ? (
          <>
            <span style={{ color: deltaPositive ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
            </span>
            <span style={{ color: "var(--ink-4)", marginLeft: 6 }}>vs. anterior</span>
          </>
        ) : (
          <span style={{ color: "var(--ink-4)" }}>{hint ?? ""}</span>
        )}
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
