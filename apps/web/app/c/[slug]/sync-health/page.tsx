"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { listJobs, type SyncJobRead } from "@/lib/api";

export default function SyncHealthPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sync-jobs-all", slug],
    queryFn: () => listJobs(slug, 30),
    enabled: !!slug,
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "running") ? 3000 : false),
  });

  const jobs = data ?? [];
  const running = jobs.filter((j) => j.status === "running").length;
  const errors = jobs.filter((j) => j.status === "error").length;
  const done = jobs.filter((j) => j.status === "done").length;

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
        <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--neg)" }}>
          Erro ao ler jobs de sincronização.
        </div>
      )}

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
