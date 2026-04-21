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
      <div className="page-head">
        <div>
          <div className="meta">11 — PLANEJAMENTO</div>
          <h1>Planejamento do cliente</h1>
          <div className="sub">Tarefas, calendário e arquivos em uma só tela</div>
        </div>
      </div>

      {/* Segmented control — troca de tab */}
      <div role="tablist" className="seg" style={{ marginBottom: 24, width: "fit-content" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={current === t.key}
            className={current === t.key ? "on" : ""}
            onClick={() => setTab(t.key)}
            title={t.desc}
          >
            {t.label}
          </button>
        ))}
      </div>

      {TabContent}
    </>
  );
}
