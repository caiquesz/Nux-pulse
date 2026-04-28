"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { listJobs, metaDataHealth, type SyncJobRead } from "@/lib/api";

export default function SyncHealthPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sync-jobs-all", slug],
    queryFn: () => listJobs(slug, 30),
    enabled: !!slug,
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "running") ? 3000 : false),
  });
  const healthQ = useQuery({
    queryKey: ["data-health", slug],
    queryFn: () => metaDataHealth(slug, 30),
    enabled: !!slug,
  });

  const jobs = data ?? [];
  const running = jobs.filter((j) => j.status === "running").length;
  const errors = jobs.filter((j) => j.status === "error").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const h = healthQ.data;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">14 — SYNC HEALTH</div>
          <h1>Saúde da sincronização</h1>
          <div className="sub">
            {isLoading ? "Carregando…" : `${jobs.length} jobs · ${done} ok · ${running} rodando · ${errors} erro`}
          </div>
        </div>
      </div>

      {isError && (
        <div className="card" style={{ padding: 16,  }}>
          Erro ao ler jobs de sincronização.
        </div>
      )}

      {/* ── Data Health (30d) ───────────────────────────────────────── */}
      {h && (
        <section style={{ marginBottom: 24 }}>
          <div className="sec-head">
            <span className="num">01</span>
            <h3>Confiabilidade dos dados · últimos {h.window.days} dias</h3>
            <div className="rule" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Cobertura
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                {h.days_with_data}<span style={{ color: "var(--ink-4)" }}>/{h.expected_days}</span>
              </div>
              <div style={{ fontSize: 11, color: h.gaps.length > 0 ? "var(--warn)" : "var(--pos)" }}>
                {h.gaps.length > 0 ? `${h.gaps.length} dia(s) sem dado` : "nenhum gap"}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Último sync bem-sucedido
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                {h.last_successful_sync
                  ? new Date(h.last_successful_sync.finished_at).toLocaleString("pt-BR", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {h.last_successful_sync ? `job #${h.last_successful_sync.job_id} · ${h.last_successful_sync.rows_written} rows` : "nenhum"}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Erros recentes
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: h.recent_errors.length > 0 ? "var(--neg)" : "var(--pos)" }}>
                {h.recent_errors.length}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                últimos 5 jobs com erro
              </div>
            </div>
          </div>

          {/* Reconciliações — soma por breakdown deve bater com soma base ±1% */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10, fontWeight: 600 }}>
              Reconciliação de totais{" "}
              <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>
                (soma por breakdown vs. soma base · deve bater ±1%)
              </span>
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--ink-4)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 8px" }}>Breakdown</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Base</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Por breakdown</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Diff</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {h.reconciliations.map((r) => (
                  <tr key={r.breakdown} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="mono" style={{ padding: "8px", color: "var(--ink-3)" }}>{r.breakdown.replace("_aggregated_by_advertiser_time_zone", "")}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>R$ {r.base_spend.toFixed(2)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>R$ {r.breakdown_spend.toFixed(2)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.status === "drift" ? "var(--neg)" : "var(--ink-3)" }}>
                      {r.diff_pct == null ? "—" : `${r.diff_pct.toFixed(2)}%`}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "ok" && <span className="tag" style={{ background: "var(--pos-bg)", color: "var(--pos)" }}>✓ ok</span>}
                      {r.status === "drift" && <span className="tag" style={{ background: "var(--neg-bg)", color: "var(--neg)" }}>drift</span>}
                      {r.status === "missing" && <span className="tag" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>sem dado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {h.gaps.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--warn)" }}>
                ⚠ Gaps nos dias: <span className="mono">{h.gaps.slice(0, 10).join(", ")}{h.gaps.length > 10 ? `… +${h.gaps.length - 10}` : ""}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="sec-head" style={{ marginTop: 12 }}>
        <span className="num">02</span>
        <h3>Histórico de jobs</h3>
        <div className="rule" />
      </div>

      <div className="card tight" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <th style={th}>Job</th>
              <th style={th}>Plataforma</th>
              <th style={th}>Status</th>
              <th style={th}>Janela</th>
              <th style={th}>Rows</th>
              <th style={th}>Duração</th>
              <th style={th}>Quando</th>
              <th style={th}>Erro</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}><code className="mono">#{j.id}</code> <span style={{ color: "var(--ink-3)" }}>{j.kind}</span></td>
                <td style={td}>{j.platform}</td>
                <td style={td}><StatusTag status={j.status} /></td>
                <td style={td} className="mono" >
                  {j.window_start && j.window_end
                    ? `${j.window_start} → ${j.window_end}`
                    : "—"}
                </td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{j.rows_written.toLocaleString("pt-BR")}</td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatDuration(j)}</td>
                <td style={{ ...td, color: "var(--ink-3)" }}>{formatWhen(j)}</td>
                <td style={{ ...td, color: "var(--neg)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.error_message ?? undefined}>
                  {j.error_message ? j.error_message.slice(0, 80) : "—"}
                </td>
              </tr>
            ))}
            {!isLoading && jobs.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
                  Nenhum job ainda — vá em <strong>Configurações</strong> e clique em <strong>Sincronizar agora</strong>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 12 }}>
        Atualiza automaticamente a cada 3s enquanto há jobs em execução.
      </p>
    </>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };

function StatusTag({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    done: { bg: "var(--pos-bg)", fg: "var(--pos)", label: "done" },
    error: { bg: "var(--neg-bg)", fg: "var(--neg)", label: "error" },
    running: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "running" },
    pending: { bg: "var(--surface-2)", fg: "var(--ink-3)", label: "pending" },
  };
  const s = styles[status] ?? { bg: "var(--surface-2)", fg: "var(--ink-3)", label: status };
  return <span className="tag" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

function formatDuration(j: SyncJobRead): string {
  if (!j.started_at) return "—";
  const start = new Date(j.started_at).getTime();
  const end = j.finished_at ? new Date(j.finished_at).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatWhen(j: SyncJobRead): string {
  const t = j.started_at ?? j.finished_at;
  if (!t) return "—";
  const d = new Date(t);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
