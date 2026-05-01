"use client";

interface SyncIndicatorProps {
  /** Label "há Xmin" / "sincronizando…" / "nunca sincronizado" */
  label: string;
  /** Status do dot — controla cor + animacao */
  status: "ok" | "syncing" | "err" | "never";
  /** Timestamp ms da ultima sync (pra tooltip detalhado) */
  lastDoneAt: number | null;
}

/**
 * SyncIndicator — pill com dot + label "atualizado ha X". Usa estilos do
 * globals.css (.sync-indicator, .sync-dot, .sync-label).
 *
 * Plug-and-play em qualquer header de page que tenha .page-head-actions:
 *   <SyncIndicator label={lastSyncLabel} status={lastSyncStatus}
 *                  lastDoneAt={lastDoneAt} />
 */
export function SyncIndicator({ label, status, lastDoneAt }: SyncIndicatorProps) {
  const dotClass =
    status === "syncing" ? "syncing" : status === "err" ? "err" : status === "ok" ? "ok" : "never";

  const tooltip =
    status === "syncing"
      ? "Sincronização em andamento — Meta API"
      : lastDoneAt
        ? `Última sync: ${new Date(lastDoneAt).toLocaleString("pt-BR")}\nAuto-refresh: dado polled a cada 60s`
        : status === "err"
          ? "Última sincronização falhou — clique em Sincronizar para tentar de novo"
          : "Nenhuma sincronização registrada";

  return (
    <div className="sync-indicator" title={tooltip}>
      <span className={`sync-dot ${dotClass}`} />
      <span className="sync-label">{label}</span>
    </div>
  );
}
