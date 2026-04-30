"use client";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";

import { TasksTab } from "@/components/project/TasksTab";
import { CalendarTab } from "@/components/project/CalendarTab";
import { FilesTab } from "@/components/project/FilesTab";

type TabKey = "tasks" | "calendar" | "files";
const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: "tasks",    label: "Tarefas",    desc: "Lista e status" },
  { key: "calendar", label: "Calendário", desc: "Visão mensal" },
  { key: "files",    label: "Arquivos",   desc: "Briefings, ID visual, fluxogramas" },
];

export default function ProjectPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const slug = params?.slug ?? "";
  const current = (sp.get("tab") as TabKey) ?? "tasks";

  const setTab = (k: TabKey) => {
    const q = new URLSearchParams(sp.toString());
    q.set("tab", k);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const TabContent = useMemo(() => {
    if (current === "calendar") return <CalendarTab slug={slug} />;
    if (current === "files") return <FilesTab slug={slug} />;
    return <TasksTab slug={slug} />;
  }, [current, slug]);

  return (
    <>
      {/* Header enxuto: apenas o nome do documento + tabs Linear-style.
          Breadcrumb global (CLIENTE / PLANEJAMENTO) ja contextualiza acima. */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 16, marginBottom: 18, borderBottom: "1px solid var(--border)",
      }}>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em",
          margin: 0, paddingBottom: 12,
        }}>
          Planejamento
        </h1>

        {/* Tabs alinhadas com a baseline do título (Linear-style) */}
        <div role="tablist" style={{ display: "flex", gap: 0 }}>
          {TABS.map((t) => {
            const active = current === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                title={t.desc}
                style={{
                  position: "relative",
                  background: "transparent", border: "none",
                  padding: "10px 14px", marginBottom: -1,
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                  borderBottom: `2px solid ${active ? "var(--ink)" : "transparent"}`,
                  transition: "color .08s, border-color .08s",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--ink-2)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--ink-3)"; }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {TabContent}
    </>
  );
}
