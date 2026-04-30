"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createTask, deleteTask, listTasks, listTeam, updateTask,
  type Task, type TaskCreate,
} from "@/lib/api";
import { PRIORITY, STATUS } from "./constants";

// ═══════════════════════════════════════════════════════════════════════════
//  CALENDAR TAB — visão mensal estilo Cron/Fantastical
//  - Navegação: ← hoje → + nova
//  - Células: hover sutil, click abre criação rápida
//  - Hoje: número dentro de pill azul
//  - Dias do mês anterior/próximo em opacidade reduzida (preenchem o grid)
//  - Task chips compactos, overflow "+N more" como popover
//  - Click na task: abre modal de edição (compartilha componente com TasksTab)
// ═══════════════════════════════════════════════════════════════════════════

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAY_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MAX_VISIBLE_TASKS = 3;

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function weekdayPtBR(d: Date): number {
  const js = d.getDay(); // 0=dom
  return (js + 6) % 7;  // 0=seg
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function keyOf(d: Date) {
  // YYYY-MM-DD em timezone LOCAL (não UTC) — senão datas de noite passam pro dia seguinte.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════

export function CalendarTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const tasksQ = useQuery({ queryKey: ["tasks", slug], queryFn: () => listTasks(slug), enabled: !!slug });
  const teamQ  = useQuery({ queryKey: ["team"],        queryFn: () => listTeam() });

  // Estado de modais: criar rápido em uma data / editar task / expandir dia
  const [creating, setCreating] = useState<{ dateISO: string } | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [expandedDay, setExpandedDay] = useState<{ dateISO: string } | null>(null);

  const createMut = useMutation({
    mutationFn: (body: TaskCreate) => createTask(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      setCreating(null);
    },
  });
  const editMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TaskCreate> }) => updateTask(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks", slug] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  });

  // Grid de 6 semanas — começa na primeira segunda-feira antes ou igual ao dia 1
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const pre = weekdayPtBR(first);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - pre);
    // 42 células (6 semanas × 7 dias) cobre qualquer mês
    const out: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push({ date: d, inMonth: d.getMonth() === cursor.getMonth() });
    }
    return out;
  }, [cursor]);

  // Indexa tasks por dia (usa keyOf local, não UTC)
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasksQ.data ?? []) {
      if (!t.due_at) continue;
      const d = new Date(t.due_at);
      const k = keyOf(d);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    }
    // Ordena por hora do due_at
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
    }
    return map;
  }, [tasksQ.data]);

  const withoutDate = (tasksQ.data ?? []).filter((t) => !t.due_at && t.status !== "done");

  const today = new Date();
  const isCurrentMonth =
    cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();

  const monthTotal = (tasksQ.data ?? []).filter((t) => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
  }).length;

  return (
    <div>
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h2 style={{
              fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
              textTransform: "capitalize", margin: 0,
            }}>
              {MONTH_NAMES[cursor.getMonth()]}
            </h2>
            <span style={{
              fontSize: 20, fontWeight: 400, color: "var(--ink-4)",
              letterSpacing: "-0.01em",
            }}>
              {cursor.getFullYear()}
            </span>
          </div>
          {monthTotal > 0 && (
            <span className="mono" style={{
              fontSize: 11, color: "var(--ink-3)", letterSpacing: 0.3,
              background: "var(--surface-2)", padding: "3px 8px", borderRadius: 999,
            }}>
              {monthTotal} {monthTotal === 1 ? "tarefa" : "tarefas"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setCursor(addMonths(cursor, -1))}
            aria-label="Mês anterior"
            className="cal-nav"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="cal-nav-text"
            disabled={isCurrentMonth}
            style={{ opacity: isCurrentMonth ? 0.5 : 1 }}
          >
            Hoje
          </button>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label="Próximo mês"
            className="cal-nav"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 6px" }} />
          <button
            className="btn"
            onClick={() => setCreating({ dateISO: keyOf(today) })}
          >
            + Nova tarefa
          </button>
        </div>
      </div>

      {/* ── GRID HEADER (dias da semana) ───────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderBottom: "none",
        borderRadius: "10px 10px 0 0",
        overflow: "hidden",
      }}>
        {DAY_HEADERS.map((d, i) => {
          const isWeekend = i >= 5;
          return (
            <div
              key={d}
              className="mono"
              style={{
                fontSize: 10, letterSpacing: 1.4,
                color: isWeekend ? "var(--ink-4)" : "var(--ink-3)",
                textTransform: "uppercase", fontWeight: 600,
                padding: "10px 12px", textAlign: "center",
                borderRight: i < 6 ? "1px solid var(--border)" : "none",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>

      {/* ── GRID DE DIAS ─────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gridAutoRows: "1fr",
        border: "1px solid var(--border)",
        borderTop: "none",
        borderRadius: "0 0 10px 10px",
        overflow: "hidden",
        minHeight: 680, // 6 semanas × ~113px
      }}>
        {cells.map((cell, i) => {
          const k = keyOf(cell.date);
          const dayTasks = tasksByDay.get(k) ?? [];
          const isToday = sameDay(cell.date, today);
          const dow = weekdayPtBR(cell.date);
          const isWeekend = dow >= 5;
          const row = Math.floor(i / 7);
          const col = i % 7;
          return (
            <DayCell
              key={k}
              date={cell.date}
              inMonth={cell.inMonth}
              isToday={isToday}
              isWeekend={isWeekend}
              tasks={dayTasks}
              isLastRow={row === 5}
              isLastCol={col === 6}
              onOpenTask={(t) => setEditing(t)}
              onCreateHere={() => setCreating({ dateISO: k })}
              onExpand={() => setExpandedDay({ dateISO: k })}
            />
          );
        })}
      </div>

      {/* ── LEGENDA ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 18, marginTop: 12, fontSize: 10, color: "var(--ink-4)",
        fontFamily: "var(--font-mono)", letterSpacing: 0.3, flexWrap: "wrap",
        alignItems: "center",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--ink-3)" }}>Status</span>
          {(["todo", "doing", "waiting", "done"] as const).map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, background: STATUS[s].color, borderRadius: "50%" }} />
              {STATUS[s].label}
            </span>
          ))}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--ink-3)" }}>Prioridade</span>
          {(["urgente", "alta", "media", "baixa"] as const).map((p) => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 2, height: 9, background: PRIORITY[p].color, borderRadius: 1 }} />
              {PRIORITY[p].label}
            </span>
          ))}
        </span>
      </div>

      {/* ── TAREFAS SEM DATA ─────────────────────────────────────── */}
      {withoutDate.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h3 className="mono" style={{
              fontSize: 11, color: "var(--ink-3)", letterSpacing: 1.2,
              textTransform: "uppercase", fontWeight: 600,
            }}>
              Sem data definida
            </h3>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
              {withoutDate.length}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {withoutDate.slice(0, 8).map((t) => (
              <button
                key={t.id}
                onClick={() => setEditing(t)}
                style={{
                  textAlign: "left", padding: "9px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 6, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  transition: "background .08s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", flex: 1 }}>
                  {t.title}
                </span>
                {t.assignee_name && (
                  <span
                    title={t.assignee_name}
                    style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: t.assignee_color ?? "var(--ink-3)", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700,
                    }}
                  >
                    {t.assignee_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAIS ───────────────────────────────────────────────── */}
      {creating && (
        <QuickCreateModal
          dateISO={creating.dateISO}
          team={teamQ.data ?? []}
          onSubmit={(body) => createMut.mutate(body)}
          onCancel={() => setCreating(null)}
          submitting={createMut.isPending}
          error={createMut.error ? (createMut.error as Error).message : null}
        />
      )}

      {editing && (
        <QuickEditModal
          task={editing}
          team={teamQ.data ?? []}
          onSubmit={(patch) => editMut.mutate({ id: editing.id, patch })}
          onDelete={() => {
            if (confirm(`Excluir "${editing.title}"?`)) {
              deleteMut.mutate(editing.id);
              setEditing(null);
            }
          }}
          onCancel={() => setEditing(null)}
          submitting={editMut.isPending}
          error={editMut.error ? (editMut.error as Error).message : null}
        />
      )}

      {expandedDay && (
        <DayExpandModal
          dateISO={expandedDay.dateISO}
          tasks={tasksByDay.get(expandedDay.dateISO) ?? []}
          onClose={() => setExpandedDay(null)}
          onOpenTask={(t) => { setExpandedDay(null); setEditing(t); }}
          onCreateHere={() => { setExpandedDay(null); setCreating({ dateISO: expandedDay.dateISO }); }}
        />
      )}

      <style jsx global>{`
        .cal-nav {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 6px;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--ink-2); cursor: pointer;
          transition: background .08s, border-color .08s, color .08s;
        }
        .cal-nav:hover {
          background: var(--surface-2); border-color: var(--border-2); color: var(--ink);
        }
        .cal-nav-text {
          height: 28px; padding: 0 11px; border-radius: 6px;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--ink-2); cursor: pointer; font-size: 12px; font-weight: 500;
          font-family: var(--font-sans);
          transition: background .08s, border-color .08s;
        }
        .cal-nav-text:hover:not(:disabled) {
          background: var(--surface-2); border-color: var(--border-2);
        }
        .cal-nav-text:disabled { cursor: default; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  DAY CELL
// ─────────────────────────────────────────────────────────────────────────

function DayCell({
  date, inMonth, isToday, isWeekend, tasks, isLastRow, isLastCol,
  onOpenTask, onCreateHere, onExpand,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  tasks: Task[];
  isLastRow: boolean;
  isLastCol: boolean;
  onOpenTask: (t: Task) => void;
  onCreateHere: () => void;
  onExpand: () => void;
}) {
  const [hover, setHover] = useState(false);
  const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
  const extra = tasks.length - visible.length;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onCreateHere}
      role="button"
      style={{
        position: "relative",
        minHeight: 112,
        padding: 6,
        background: inMonth ? "var(--surface)" : "var(--surface-2)",
        borderRight: isLastCol ? "none" : "1px solid var(--border)",
        borderBottom: isLastRow ? "none" : "1px solid var(--border)",
        cursor: "pointer",
        transition: "background .08s",
        display: "flex", flexDirection: "column", gap: 4,
        opacity: inMonth ? 1 : 0.5,
      }}
    >
      {/* Header da célula: número + plus no hover */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 22, marginBottom: 2,
      }}>
        {isToday ? (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999,
            border: "1.5px solid var(--hero)",
            color: "var(--hero)",
            fontSize: 12, fontWeight: 700, fontFamily: "var(--font-sans)",
            fontVariantNumeric: "tabular-nums", letterSpacing: 0.2,
            marginLeft: 2,
          }}>
            {date.getDate()}
          </span>
        ) : (
          <span
            className="mono"
            style={{
              fontSize: 12,
              color: inMonth
                ? (isWeekend ? "var(--ink-4)" : "var(--ink-2)")
                : "var(--ink-4)",
              fontWeight: 500, fontVariantNumeric: "tabular-nums",
              padding: "0 6px",
            }}
          >
            {date.getDate()}
          </span>
        )}
        {hover && inMonth && (
          <span
            onClick={(e) => { e.stopPropagation(); onCreateHere(); }}
            title="Criar tarefa neste dia"
            style={{
              width: 16, height: 16, borderRadius: 3,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--ink-3)", fontSize: 11, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", marginRight: 2,
            }}
          >+</span>
        )}
      </div>

      {/* Tasks do dia */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflow: "hidden" }}>
        {visible.map((t) => (
          <DayTaskChip
            key={t.id}
            task={t}
            onClick={() => onOpenTask(t)}
          />
        ))}
        {extra > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="mono"
            style={{
              textAlign: "left",
              fontSize: 10, color: "var(--ink-3)", letterSpacing: 0.3,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "2px 6px", borderRadius: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--ink-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-3)"; }}
          >
            +{extra} {extra === 1 ? "tarefa" : "tarefas"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  TASK CHIP dentro da célula
// ─────────────────────────────────────────────────────────────────────────

function DayTaskChip({ task, onClick }: { task: Task; onClick: () => void }) {
  const priCfg = PRIORITY[task.priority];
  const statusCfg = STATUS[task.status];
  const done = task.status === "done";
  const due = task.due_at ? new Date(task.due_at) : null;
  const hhmm = due
    ? due.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${task.title} · ${statusCfg.label} · ${priCfg.label}`}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 6px 3px 5px",
        background: "transparent",
        border: "none",
        borderLeft: `2px solid ${priCfg.color}`,
        borderRadius: 3,
        cursor: "pointer", textAlign: "left", width: "100%",
        overflow: "hidden",
        transition: "background .08s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: statusCfg.color, flexShrink: 0,
      }} />
      {hhmm && (
        <span className="mono" style={{
          fontSize: 9.5, color: "var(--ink-4)", letterSpacing: 0.2,
          fontVariantNumeric: "tabular-nums", flexShrink: 0, fontWeight: 500,
        }}>
          {hhmm}
        </span>
      )}
      <span style={{
        fontSize: 11.5, fontWeight: 500,
        color: done ? "var(--ink-4)" : "var(--ink-2)",
        textDecoration: done ? "line-through" : "none",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        flex: 1, minWidth: 0,
      }}>
        {task.title}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  QUICK CREATE MODAL — criar task direto no dia clicado
// ─────────────────────────────────────────────────────────────────────────

function QuickCreateModal({
  dateISO, team, onSubmit, onCancel, submitting, error,
}: {
  dateISO: string;
  team: { id: number; name: string; avatar_color: string | null }[];
  onSubmit: (body: TaskCreate) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">("media");
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const due = new Date(`${dateISO}T00:00:00`);
    due.setHours(h || 9, m || 0, 0, 0);
    onSubmit({
      title: title.trim(),
      due_at: due.toISOString(),
      priority,
      assignee_id: assigneeId === "" ? null : Number(assigneeId),
    });
  }

  const label = new Date(`${dateISO}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <ModalShell onClose={onCancel} title="Nova tarefa" subtitle={label}>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Revisar criativos da campanha de vendas"
          required
          style={{
            ...inputStyle,
            fontSize: 15, fontWeight: 500, padding: "11px 13px",
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <Lbl>Hora</Lbl>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Lbl>Prioridade</Lbl>
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={inputStyle}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <Lbl>Responsável</Lbl>
            <select
              value={assigneeId === "" ? "" : String(assigneeId)}
              onChange={(e) => setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))}
              style={inputStyle}
            >
              <option value="">— sem —</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancelar</button>
          <button type="submit" className="btn" disabled={submitting || !title.trim()}>
            {submitting ? "Salvando…" : "Criar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  QUICK EDIT MODAL — edita os campos mais comuns (título, data, prioridade, status, responsável)
// ─────────────────────────────────────────────────────────────────────────

function QuickEditModal({
  task, team, onSubmit, onDelete, onCancel, submitting, error,
}: {
  task: Task;
  team: { id: number; name: string; avatar_color: string | null }[];
  onSubmit: (patch: Partial<TaskCreate>) => void;
  onDelete: () => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(() => task.due_at ? keyOf(new Date(task.due_at)) : "");
  const [time, setTime] = useState(() => {
    if (!task.due_at) return "";
    const d = new Date(task.due_at);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">(task.priority as "baixa");
  const [status, setStatus] = useState<"todo" | "doing" | "waiting" | "done">(task.status as "todo");
  const [assigneeId, setAssigneeId] = useState<number | "">(task.assignee_id ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    let due_at: string | null = null;
    if (date) {
      const d = new Date(`${date}T00:00:00`);
      const [h, m] = (time || "09:00").split(":").map(Number);
      d.setHours(h || 9, m || 0, 0, 0);
      due_at = d.toISOString();
    }
    onSubmit({
      title: title.trim(),
      due_at,
      priority,
      status,
      assignee_id: assigneeId === "" ? null : Number(assigneeId),
    });
  }

  return (
    <ModalShell onClose={onCancel} title="Editar tarefa">
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{ ...inputStyle, fontSize: 15, fontWeight: 500, padding: "11px 13px" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
          <div>
            <Lbl>Data</Lbl>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Lbl>Hora</Lbl>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <Lbl>Status</Lbl>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={inputStyle}>
              <option value="todo">A fazer</option>
              <option value="doing">Em andamento</option>
              <option value="waiting">Aguardando</option>
              <option value="done">Concluída</option>
            </select>
          </div>
          <div>
            <Lbl>Prioridade</Lbl>
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={inputStyle}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <Lbl>Responsável</Lbl>
            <select
              value={assigneeId === "" ? "" : String(assigneeId)}
              onChange={(e) => setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))}
              style={inputStyle}
            >
              <option value="">— sem —</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onDelete}
            style={{
              background: "transparent", border: "none",
              color: "var(--neg)", fontSize: 12, cursor: "pointer", padding: "8px 4px",
            }}
          >
            Excluir tarefa
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancelar</button>
            <button type="submit" className="btn" disabled={submitting || !title.trim()}>
              {submitting ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  DAY EXPAND MODAL — quando tem mais tasks que cabem na célula
// ─────────────────────────────────────────────────────────────────────────

function DayExpandModal({
  dateISO, tasks, onClose, onOpenTask, onCreateHere,
}: {
  dateISO: string;
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (t: Task) => void;
  onCreateHere: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = new Date(`${dateISO}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <ModalShell onClose={onClose} title={label.charAt(0).toUpperCase() + label.slice(1)}>
      <div style={{ display: "grid", gap: 6 }}>
        {tasks.map((t) => {
          const priCfg = PRIORITY[t.priority];
          const statusCfg = STATUS[t.status];
          const hhmm = t.due_at
            ? new Date(t.due_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : null;
          return (
            <button
              key={t.id}
              onClick={() => onOpenTask(t)}
              style={{
                textAlign: "left", padding: "10px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6, cursor: "pointer",
                display: "grid", gridTemplateColumns: "54px 1fr auto", gap: 10, alignItems: "center",
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {hhmm ?? "—"}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 500, color: "var(--ink)",
                textDecoration: t.status === "done" ? "line-through" : "none",
              }}>
                {t.title}
              </span>
              <span className="mono" style={{
                fontSize: 9, color: statusCfg.color, background: statusCfg.bg,
                padding: "2px 7px", borderRadius: 999, letterSpacing: 0.4,
                textTransform: "uppercase", fontWeight: 600,
              }}>
                {statusCfg.label}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={onCreateHere}>+ Nova tarefa neste dia</button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  MODAL SHELL compartilhado
// ─────────────────────────────────────────────────────────────────────────

function ModalShell({
  title, subtitle, onClose, children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(10, 10, 8, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "8vh 16px 16px",
        overflow: "auto",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 560,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, boxShadow: "0 24px 56px rgba(0,0,0,0.28)",
        padding: 22,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{
              fontSize: 15, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em",
            }}>
              {title}
            </div>
            {subtitle && (
              <div className="mono" style={{
                fontSize: 11, color: "var(--ink-3)", marginTop: 3, letterSpacing: 0.3,
              }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: "transparent", border: "none", color: "var(--ink-4)",
              fontSize: 16, cursor: "pointer", padding: "2px 6px", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
      textTransform: "uppercase", marginBottom: 4, fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  outline: "none",
  width: "100%",
};
