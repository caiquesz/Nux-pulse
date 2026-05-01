"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { listJobs, triggerMetaBackfill } from "./api";

/** Intervalo padrao de polling automatico das queries de dados Meta.
 *  60s = balance entre frescura e carga (back chama count/sum no Postgres,
 *  endpoints leves). React Query default `refetchIntervalInBackground=false`
 *  ja pausa quando aba escondida, e `refetchOnWindowFocus=true` faz refetch
 *  instantaneo quando volta foco. */
export const POLL_MS = 60_000;

/** Threshold pra considerar dado "stale" e disparar hot-sync automatico.
 *  30min equilibra frescura (sync rodou nas ultimas X min) vs nao bater
 *  na Meta API toda vez que user troca de tab. */
const STALE_MS = 30 * 60 * 1000;

/**
 * useAutoSync — encapsula tudo que cada tela precisa pra ter dado fresco:
 *
 *   1. Track do ultimo SyncJob via listJobs (com refetch a cada 3s enquanto
 *      ha job rodando, parado quando idle)
 *   2. Auto-trigger de hot-sync (days=2, level=account) quando dado tah
 *      stale: ultimo job done > 30min ago, ou nunca rodou
 *      - Skip se job rodando, mutation pending, ou ultimo job errou
 *      - useRef previne re-trigger em re-render (1x por mount)
 *   3. Mutations expostas: `triggerHotSync` (rapido, level=account, days=2)
 *      e `triggerFullSync(days, level?)` (completo, configuravel)
 *   4. Label "ha Xmin" formatado, ticka cada 30s sozinho
 *
 * Uso tipico em uma page:
 *
 *   const { lastSyncLabel, lastSyncStatus, triggerFullSync, syncing } =
 *     useAutoSync(slug);
 *
 * Pra UI do header, usa <SyncIndicator /> + botao customizado que chama
 * triggerFullSync com os params da page.
 */
export function useAutoSync(slug: string | undefined | null) {
  const qc = useQueryClient();

  const jobsQ = useQuery({
    queryKey: ["sync-jobs", slug],
    queryFn: () => listJobs(slug!, 1),
    enabled: !!slug,
    refetchInterval: (q) => (q.state.data?.[0]?.status === "running" ? 3000 : false),
  });

  const lastJob = jobsQ.data?.[0];
  const running = lastJob?.status === "running";
  const lastErrored = lastJob?.status === "error";
  const lastDoneAt =
    lastJob?.status === "done" && lastJob.finished_at
      ? new Date(lastJob.finished_at).getTime()
      : null;

  // Hot-sync: rapido e leve. Usado pelo auto-trigger e pode ser exposto
  // como botao "atualizar agora" se a page quiser.
  const hotSyncMut = useMutation({
    mutationFn: () => triggerMetaBackfill(slug!, { days: 2, level: "account" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", slug] });
      // 4s e suficiente pro hot-sync (account/2 dias) terminar
      setTimeout(() => qc.invalidateQueries({ queryKey: ["meta"] }), 4000);
    },
  });

  // Full-sync: usado pelo botao "Sincronizar". Days/level escolhidos pela
  // page (ex: Overview passa days=30, level=ad).
  const fullSyncMut = useMutation({
    mutationFn: (params: { days: number; level?: "account" | "campaign" | "adset" | "ad" }) =>
      triggerMetaBackfill(slug!, { days: params.days, level: params.level ?? "ad" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", slug] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["meta"] }), 5000);
    },
  });

  // Auto-trigger no mount se stale
  const autoSyncFiredRef = useRef(false);
  useEffect(() => {
    if (!slug) return;
    if (autoSyncFiredRef.current) return;
    if (jobsQ.isLoading) return;
    if (running) return;
    if (hotSyncMut.isPending || fullSyncMut.isPending) return;
    if (lastErrored) return;

    const stale = lastDoneAt == null || Date.now() - lastDoneAt > STALE_MS;
    if (!stale) return;

    autoSyncFiredRef.current = true;
    hotSyncMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, jobsQ.isLoading, running, lastDoneAt, lastErrored]);

  // Tick pra label "ha X" atualizar em tempo real
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const lastSyncLabel = useMemo(() => {
    if (running) return "sincronizando…";
    if (!lastDoneAt) return "nunca sincronizado";
    const ageSec = Math.floor((Date.now() - lastDoneAt) / 1000);
    if (ageSec < 60) return "agora há pouco";
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 60) return `há ${ageMin}min`;
    const ageHr = Math.floor(ageMin / 60);
    if (ageHr < 24) return `há ${ageHr}h`;
    const ageDays = Math.floor(ageHr / 24);
    return `há ${ageDays}d`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDoneAt, running]);

  type Status = "ok" | "syncing" | "err" | "never";
  const lastSyncStatus: Status = running
    ? "syncing"
    : lastErrored
      ? "err"
      : lastDoneAt
        ? "ok"
        : "never";

  return {
    /** Pill label "ha Xmin" / "sincronizando…" / "nunca sincronizado" */
    lastSyncLabel,
    /** Status pra colorir o dot */
    lastSyncStatus,
    /** Timestamp ms da ultima sync done (null se nunca) */
    lastDoneAt,
    /** Job tah rodando agora */
    running,
    /** Algum mutate em flight */
    syncing: running || hotSyncMut.isPending || fullSyncMut.isPending,
    /** Dispara sync rapido (days=2, level=account) */
    triggerHotSync: () => hotSyncMut.mutate(),
    /** Dispara sync completo. Default level=ad (todos niveis ate ad-creative) */
    triggerFullSync: (days: number, level?: "account" | "campaign" | "adset" | "ad") =>
      fullSyncMut.mutate({ days, level }),
    /** Pendings individuais pra disable de botoes */
    hotSyncPending: hotSyncMut.isPending,
    fullSyncPending: fullSyncMut.isPending,
  };
}
