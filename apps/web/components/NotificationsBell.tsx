"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  countUnread, listNotifications, markAllNotificationsRead, markNotificationRead,
  type Notification as Notif,
} from "@/lib/api";
import { Icon } from "./icons/Icon";

const POLL_MS = 30_000;

const KIND_ICON: Record<string, string> = {
  task_assigned: "◎",
  task_due_soon: "⏰",
  task_overdue: "⚠",
  file_uploaded: "📎",
  task_completed: "✓",
  ai_action: "◆",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function NotificationsBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const countQ = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => countUnread(),
    refetchInterval: POLL_MS,
  });

  const listQ = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => listNotifications(false, 30),
    enabled: open,
  });

  const markOneMut = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  // fecha popover ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const count = countQ.data?.count ?? 0;

  const openNotif = (n: Notif) => {
    if (!n.read_at) markOneMut.mutate(n.id);
    setOpen(false);
    if (n.link_url) router.push(n.link_url);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        style={{ position: "relative" }}
        title={count > 0 ? `${count} não lidas` : "Notificações"}
        onClick={() => setOpen((s) => !s)}
      >
        <Icon name="bell" size={14} />
        {count > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            minWidth: 15, height: 15, padding: "0 4px",
            borderRadius: 8, background: "var(--neg)", color: "#fff",
            fontSize: 9, fontFamily: "var(--font-sans)", fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid var(--surface)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            width: 360, maxHeight: 520,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
            zIndex: 200, overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}
        >
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Notificações</div>
            {count > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                style={{
                  background: "transparent", border: "none", color: "var(--ink-3)",
                  fontSize: 11, cursor: "pointer", padding: 0,
                }}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div style={{ overflow: "auto", maxHeight: 440 }}>
            {listQ.isLoading && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--ink-4)", fontSize: 12 }}>
                Carregando…
              </div>
            )}
            {listQ.data && listQ.data.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--ink-4)", fontSize: 12 }}>
                Nenhuma notificação.
              </div>
            )}
            {listQ.data?.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotif(n)}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 14px",
                  background: n.read_at ? "transparent" : "var(--surface-2)",
                  border: "none", borderBottom: "1px solid var(--border)",
                  cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start",
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: "var(--surface-3)", color: "var(--ink-2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  flexShrink: 0,
                }}>
                  {KIND_ICON[n.kind] ?? "•"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: n.read_at ? 500 : 600, marginBottom: 2, color: "var(--ink)" }}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 3, lineHeight: 1.4 }}>
                      {n.body}
                    </div>
                  )}
                  <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.3 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                {!n.read_at && (
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "var(--hero)", marginTop: 6, flexShrink: 0,
                  }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
