"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { listTasks, type Task } from "@/lib/api";
import { PRIORITY } from "./constants";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAY_HEADERS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

// Grid semana começa segunda (0=seg … 6=dom)
function weekdayPtBR(d: Date): number {
  const js = d.getDay(); // 0=dom, 1=seg…
  return (js + 6) % 7;
}

const PRIORITY_DOT: Record<string, string> = {
  baixa: PRIORITY.baixa.color,
  media: PRIORITY.media.color,
  alta:  PRIORITY.alta.color,
  urgente: PRIORITY.urgente.color,
};

export function CalendarTab({ slug }: { slug: string }) {
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const tasksQ = useQuery({ queryKey: ["tasks", slug], queryFn: () => listTasks(slug), enabled: !!slug });

  const gridDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const pre = weekdayPtBR(first); // dias em branco antes
    const daysInMonth = last.getDate();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < pre; i++) cells.push({ date: null });
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i) });
    }
    // Preenche até múltiplo de 7 (max 6 semanas)
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [cursor]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasksQ.data ?? []) {
      if (!t.due_at) continue;
      const d = new Date(t.due_at);
      // Só considera tasks do mês visível (otimização leve — o render filtra de qualquer forma)
      const key = d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasksQ.data]);

  const withoutDate = (tasksQ.data ?? []).filter((t) => !t.due_at && t.status !== "done");

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const isSameMonth =
    cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();

  return (
    <div>
      {/* Header do calendário */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, padding: "0 2px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Mês anterior">←</button>
          <div style={{ fontSize: 16, fontWeight: 600, minWidth: 200 }}>
            {MONTH_NAMES[cursor.getMonth()]} <span className="mono" style={{ color: "var(--ink-3)", fontSize: 13 }}>{cursor.getFullYear()}</span>
          </div>
          <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Próximo mês">→</button>
        </div>
        {!isSameMonth && (
          <button className="btn ghost" onClick={() => setCursor(startOfMonth(new Date()))} style={{ fontSize: 12 }}>
            Hoje
          </button>
        )}
      </div>

      {/* Grid header (dias da semana) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DAY_HEADERS.map((d) => (
          <div key={d} className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.8, textTransform: "uppercase", padding: "4px 6px" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {gridDays.map((cell, i) => {
          if (!cell.date) {
            return <div key={i} style={{ minHeight: 98, background: "var(--surface-3)", opacity: 0.3, borderRadius: 6 }} />;
          }
          const key = cell.date.toISOString().slice(0, 10);
          const tasks = tasksByDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              style={{
                minHeight: 98, padding: 6,
                background: "var(--surface)",
                border: `1px solid ${isToday ? "var(--ink-2)" : "var(--border)"}`,
                borderRadius: 6,
                display: "flex", flexDirection: "column", gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{
                  fontSize: 11, color: isToday ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: isToday ? 700 : 500,
                }}>
                  {cell.date.getDate()}
                </span>
                {tasks.length > 3 && (
                  <span className="mono" style={{ fontSize: 9, color: "var(--ink-4)" }}>
                    +{tasks.length - 3}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
                {tasks.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    title={`${t.title} · ${t.status}`}
                    style={{
                      fontSize: 10, padding: "2px 4px",
                      background: "var(--surface-2)",
                      borderLeft: `2px solid ${PRIORITY_DOT[t.priority] ?? "var(--ink-4)"}`,
                      borderRadius: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: t.status === "done" ? "var(--ink-4)" : "var(--ink-2)",
                      textDecoration: t.status === "done" ? "line-through" : "none",
                    }}
                  >
                    {t.due_at && (
                      <span className="mono" style={{ color: "var(--ink-4)", marginRight: 4, fontSize: 9 }}>
                        {new Date(t.due_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {t.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tasks sem data */}
      {withoutDate.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8, letterSpacing: 0.3 }}>
            Sem data definida ({withoutDate.length})
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {withoutDate.slice(0, 10).map((t) => (
              <div key={t.id} style={{
                fontSize: 12, padding: "8px 12px",
                background: "var(--surface-2)", borderRadius: 6,
                borderLeft: `2px solid ${PRIORITY_DOT[t.priority] ?? "var(--ink-4)"}`,
              }}>
                {t.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
