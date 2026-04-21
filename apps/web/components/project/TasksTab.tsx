"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  createTask, deleteTask, listTasks, listTeam, updateTask,
  type Task, type TaskCreate, type TaskFilters, type TaskPlatform,
  type TaskPriority, type TaskStatus, type TaskType,
} from "@/lib/api";
import { DateTimePicker } from "./DateTimePicker";
import { PLATFORM, PRIORITY, STATUS, TASK_TYPE } from "./constants";

// ═══════════════════════════════════════════════════════════════════════
//  TASKS TAB — reescrito pra contexto de tráfego pago
//  Camadas: Toolbar de filtros → Grupos temporais → Card de task
// ═══════════════════════════════════════════════════════════════════════

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "waiting", "done"];

type PeriodFilter = "all" | "today" | "week" | "fortnight" | "overdue" | "undated";
const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: "Todos",
  today: "Hoje",
  week: "Esta semana",
  fortnight: "Próx. 15 dias",
  overdue: "Atrasadas",
  undated: "Sem data",
};

// ──────────────────────────────────────────────────────────────────────
//  Agrupamento temporal
// ──────────────────────────────────────────────────────────────────────

type Group = { key: string; label: string; tone: "neg" | "ink" | "dim"; items: Task[] };

function groupByPeriod(tasks: Task[]): Group[] {
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1);
  const endWeek = new Date(startToday); endWeek.setDate(endWeek.getDate() + 7);
  const endFortnight = new Date(startToday); endFortnight.setDate(endFortnight.getDate() + 15);

  const overdue: Task[] = [];
  const today: Task[] = [];
  const tomorrow: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];
  const undated: Task[] = [];
  const done: Task[] = [];

  for (const t of tasks) {
    if (t.status === "done") { done.push(t); continue; }
    if (!t.due_at) { undated.push(t); continue; }
    const d = new Date(t.due_at);
    if (d < startToday) { overdue.push(t); continue; }
    if (d < endToday) { today.push(t); continue; }
    const startTomorrow = new Date(endToday);
    const endTomorrow = new Date(startTomorrow); endTomorrow.setDate(endTomorrow.getDate() + 1);
    if (d < endTomorrow) { tomorrow.push(t); continue; }
    if (d < endWeek) { thisWeek.push(t); continue; }
    if (d < endFortnight) { later.push(t); continue; }
    later.push(t);
  }

  const groups: Group[] = [];
  if (overdue.length) groups.push({ key: "overdue", label: "Atrasadas", tone: "neg", items: overdue });
  if (today.length) groups.push({ key: "today", label: "Hoje", tone: "ink", items: today });
  if (tomorrow.length) groups.push({ key: "tomorrow", label: "Amanhã", tone: "ink", items: tomorrow });
  if (thisWeek.length) groups.push({ key: "week", label: "Esta semana", tone: "dim", items: thisWeek });
  if (later.length) groups.push({ key: "later", label: "Próximas 2 semanas", tone: "dim", items: later });
  if (undated.length) groups.push({ key: "undated", label: "Sem data definida", tone: "dim", items: undated });
  if (done.length) groups.push({ key: "done", label: "Concluídas", tone: "dim", items: done });
  return groups;
}

// ──────────────────────────────────────────────────────────────────────
//  Component principal
// ──────────────────────────────────────────────────────────────────────

export function TasksTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<TaskFilters>({});
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const tasksQ = useQuery({ queryKey: ["tasks", slug, filters], queryFn: () => listTasks(slug, filters), enabled: !!slug });
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });

  // Filtros client-side (period + search) — complementa os server-side
  const filtered = useMemo(() => {
    const now = new Date(); const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const endDay = new Date(today0); endDay.setDate(endDay.getDate() + 1);
    const endWeek = new Date(today0); endWeek.setDate(endWeek.getDate() + 7);
    const endFort = new Date(today0); endFort.setDate(endFort.getDate() + 15);

    return (tasksQ.data ?? []).filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())
                 && !(t.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      if (period === "all") return true;
      if (period === "undated") return !t.due_at;
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      if (period === "overdue") return d < today0 && t.status !== "done";
      if (period === "today") return d >= today0 && d < endDay;
      if (period === "week") return d >= today0 && d < endWeek;
      if (period === "fortnight") return d >= today0 && d < endFort;
      return true;
    });
  }, [tasksQ.data, period, search]);

  const groups = useMemo(() => groupByPeriod(filtered), [filtered]);

  const createMut = useMutation({
    mutationFn: (body: TaskCreate) => createTask(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      setShowForm(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TaskCreate> }) => updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  });

  const activeFilterCount =
    (filters.status ? 1 : 0) +
    (filters.platform ? 1 : 0) +
    (filters.task_type ? 1 : 0) +
    (filters.assignee_id ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (period !== "all" ? 1 : 0) +
    (search ? 1 : 0);

  return (
    <div>
      {/* ── Toolbar superior: search + novo ─────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa…"
            style={{
              width: "100%", padding: "9px 12px 9px 32px",
              borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface-2)", color: "var(--ink)",
              fontSize: 13, outline: "none",
            }}
          />
          <span style={{ position: "absolute", left: 11, top: 10, color: "var(--ink-4)", fontSize: 13 }}>⌕</span>
        </div>

        <button
          className="btn ghost"
          style={{ fontSize: 12 }}
          onClick={() => { setFilters({}); setPeriod("all"); setSearch(""); }}
          disabled={activeFilterCount === 0}
          title="Limpar filtros"
        >
          Limpar
          {activeFilterCount > 0 && (
            <span className="mono" style={{ marginLeft: 6, fontSize: 10, color: "var(--ink-4)" }}>
              ({activeFilterCount})
            </span>
          )}
        </button>

        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancelar" : "+ Nova tarefa"}
        </button>
      </div>

      {/* ── Faixa de filtros chips ──────────────────────────────────── */}
      <FilterChips
        filters={filters}
        onFiltersChange={setFilters}
        period={period}
        onPeriodChange={setPeriod}
        team={teamQ.data ?? []}
        totals={tasksQ.data ?? []}
      />

      {showForm && (
        <div style={{ margin: "16px 0 20px" }}>
          <NewTaskForm
            team={teamQ.data ?? []}
            onSubmit={(body) => createMut.mutate(body)}
            submitting={createMut.isPending}
            error={createMut.error ? (createMut.error as Error).message : null}
          />
        </div>
      )}

      {/* ── Conteúdo ────────────────────────────────────────────────── */}
      {tasksQ.isLoading && (
        <SkeletonList />
      )}
      {tasksQ.isError && (
        <div className="card" style={{ padding: 14, borderLeft: "3px solid var(--neg)", marginTop: 16 }}>
          <strong>Erro ao carregar.</strong>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{(tasksQ.error as Error)?.message}</div>
        </div>
      )}
      {groups.length === 0 && !tasksQ.isLoading && (
        <div className="card" style={{ padding: 32, textAlign: "center", marginTop: 16 }}>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 12 }}>
            {activeFilterCount > 0 ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa ainda."}
          </p>
          {!showForm && activeFilterCount === 0 && (
            <button className="btn" onClick={() => setShowForm(true)}>+ Criar primeira tarefa</button>
          )}
        </div>
      )}

      <div style={{ display: "grid", gap: 20, marginTop: 16 }}>
        {groups.map((g) => (
          <Section key={g.key} group={g}>
            {g.items.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                team={teamQ.data ?? []}
                onChangeStatus={(status) => updateMut.mutate({ id: t.id, patch: { status } })}
                onChangeAssignee={(assignee_id) => updateMut.mutate({ id: t.id, patch: { assignee_id } })}
                onDelete={() => {
                  if (confirm(`Excluir "${t.title}"?`)) deleteMut.mutate(t.id);
                }}
              />
            ))}
          </Section>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  FILTER CHIPS
// ──────────────────────────────────────────────────────────────────────

function FilterChips({
  filters, onFiltersChange, period, onPeriodChange, team, totals,
}: {
  filters: TaskFilters;
  onFiltersChange: (f: TaskFilters) => void;
  period: PeriodFilter;
  onPeriodChange: (p: PeriodFilter) => void;
  team: { id: number; name: string; avatar_color: string | null }[];
  totals: Task[];
}) {
  const countByStatus = (s: TaskStatus) => totals.filter((t) => t.status === s).length;
  const countByPlatform = (p: TaskPlatform) => totals.filter((t) => t.platform === p).length;

  return (
    <div style={{
      display: "grid", gap: 8,
      background: "var(--surface-2)",
      padding: 10, borderRadius: 10, border: "1px solid var(--border)",
    }}>
      {/* Linha 1: Status */}
      <ChipRow label="Status">
        <Chip on={!filters.status} onClick={() => onFiltersChange({ ...filters, status: undefined })}>
          Todos <Count n={totals.length} />
        </Chip>
        {STATUS_ORDER.map((s) => {
          const cfg = STATUS[s];
          const n = countByStatus(s);
          return (
            <Chip
              key={s}
              on={filters.status === s}
              onClick={() => onFiltersChange({ ...filters, status: filters.status === s ? undefined : s })}
              dot={cfg.color}
            >
              {cfg.label} <Count n={n} />
            </Chip>
          );
        })}
      </ChipRow>

      {/* Linha 2: Período */}
      <ChipRow label="Período">
        {(Object.keys(PERIOD_LABEL) as PeriodFilter[]).map((p) => (
          <Chip key={p} on={period === p} onClick={() => onPeriodChange(p)}>
            {PERIOD_LABEL[p]}
          </Chip>
        ))}
      </ChipRow>

      {/* Linha 3: Plataforma */}
      <ChipRow label="Plataforma">
        <Chip on={!filters.platform} onClick={() => onFiltersChange({ ...filters, platform: undefined })}>
          Todas
        </Chip>
        {(Object.keys(PLATFORM) as TaskPlatform[]).filter((p) => p !== "outro").map((p) => {
          const cfg = PLATFORM[p];
          const n = countByPlatform(p);
          if (n === 0 && filters.platform !== p) return null;
          return (
            <Chip
              key={p}
              on={filters.platform === p}
              onClick={() => onFiltersChange({ ...filters, platform: filters.platform === p ? undefined : p })}
              dot={cfg.color}
            >
              {cfg.label} {n > 0 && <Count n={n} />}
            </Chip>
          );
        })}
      </ChipRow>

      {/* Linha 4: Responsável */}
      {team.length > 0 && (
        <ChipRow label="Responsável">
          <Chip on={!filters.assignee_id} onClick={() => onFiltersChange({ ...filters, assignee_id: undefined })}>
            Todos
          </Chip>
          {team.map((m) => (
            <Chip
              key={m.id}
              on={filters.assignee_id === m.id}
              onClick={() => onFiltersChange({ ...filters, assignee_id: filters.assignee_id === m.id ? undefined : m.id })}
              dot={m.avatar_color ?? "var(--ink-3)"}
            >
              {m.name.split(" ")[0]}
            </Chip>
          ))}
        </ChipRow>
      )}
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span className="mono" style={{
        fontSize: 9, color: "var(--ink-4)", letterSpacing: 1,
        textTransform: "uppercase", fontWeight: 600,
        minWidth: 82,
      }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, dot, children }: { on?: boolean; onClick?: () => void; dot?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${on ? "var(--ink-2)" : "var(--border)"}`,
        background: on ? "var(--ink)" : "var(--surface)",
        color: on ? "var(--accent-ink)" : "var(--ink-2)",
        fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)",
        transition: "background .08s, border .08s",
        whiteSpace: "nowrap",
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="mono" style={{ marginLeft: 4, fontSize: 10, opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>
      {n}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  SECTION (grupo temporal)
// ──────────────────────────────────────────────────────────────────────

function Section({ group, children }: { group: Group; children: React.ReactNode }) {
  const color = group.tone === "neg" ? "var(--neg)" : group.tone === "ink" ? "var(--ink)" : "var(--ink-4)";
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <h3 className="mono" style={{
          fontSize: 11, color, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600,
        }}>
          {group.label}
        </h3>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>{group.items.length}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  TASK CARD (linha)
// ──────────────────────────────────────────────────────────────────────

function TaskCard({
  task, team, onChangeStatus, onChangeAssignee, onDelete,
}: {
  task: Task;
  team: { id: number; name: string; avatar_color: string | null }[];
  onChangeStatus: (s: TaskStatus) => void;
  onChangeAssignee: (id: number | null) => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const statusCfg = STATUS[task.status];
  const priCfg = PRIORITY[task.priority];
  const platformCfg = task.platform ? PLATFORM[task.platform] : null;
  const typeCfg = task.task_type ? TASK_TYPE[task.task_type] : null;
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && task.status !== "done" && due < new Date();
  const isDone = task.status === "done";

  const dueLabel = due ? formatDueLabel(due) : null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "3px auto 1fr auto auto auto",
        gap: 12, alignItems: "center",
        padding: "10px 14px 10px 0",
        borderRadius: 8,
        background: hover ? "var(--hover)" : "var(--surface)",
        border: "1px solid var(--border)",
        transition: "background .08s",
        opacity: isDone ? 0.65 : 1,
      }}
    >
      {/* Faixa de prioridade */}
      <div style={{ width: 3, alignSelf: "stretch", background: priCfg.color, borderRadius: "8px 0 0 8px" }} />

      {/* Platform + Type (esquerda) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 10 }}>
        {platformCfg && (
          <span
            title={platformCfg.label}
            style={{
              width: 22, height: 22, borderRadius: 5,
              background: platformCfg.color, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)",
              letterSpacing: 0.3,
            }}
          >
            {platformCfg.label.slice(0, 1)}
          </span>
        )}
      </div>

      {/* Título + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: "var(--ink)",
          textDecoration: isDone ? "line-through" : "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {task.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          {typeCfg && (
            <span className="mono" style={{
              fontSize: 9, color: "var(--ink-3)", letterSpacing: 0.6,
              textTransform: "uppercase", fontWeight: 500,
            }}>
              {typeCfg.label}
            </span>
          )}
          {task.task_type && task.duration_min && (
            <span style={{ fontSize: 9, color: "var(--ink-4)" }}>·</span>
          )}
          {task.duration_min && (
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-4)" }}>
              {task.duration_min}min
            </span>
          )}
          {task.ai_scheduled && (
            <span
              title="Claude pode reagendar"
              className="mono"
              style={{
                fontSize: 8, color: "oklch(0.45 0.18 125)",
                background: "oklch(0.95 0.12 125)",
                padding: "1px 5px", borderRadius: 3, letterSpacing: 0.5,
                textTransform: "uppercase", fontWeight: 700,
              }}
            >
              AI
            </span>
          )}
        </div>
      </div>

      {/* Due */}
      <div style={{ textAlign: "right", minWidth: 110 }}>
        {dueLabel ? (
          <div
            title={due!.toLocaleString("pt-BR")}
            className="mono"
            style={{
              fontSize: 11, color: overdue ? "var(--neg)" : "var(--ink-3)",
              fontWeight: overdue ? 600 : 400, letterSpacing: 0.2,
            }}
          >
            {dueLabel}
          </div>
        ) : (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)", fontStyle: "italic" }}>
            sem data
          </span>
        )}
      </div>

      {/* Assignee */}
      <AssigneePicker
        currentId={task.assignee_id}
        currentName={task.assignee_name}
        currentColor={task.assignee_color}
        team={team}
        onChange={onChangeAssignee}
      />

      {/* Status + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <StatusMenu current={task.status} onChange={onChangeStatus} />
        <button
          onClick={onDelete}
          title="Excluir"
          style={{
            background: "transparent", border: "none",
            color: hover ? "var(--ink-4)" : "transparent",
            cursor: "pointer", fontSize: 12, padding: "4px 6px",
            transition: "color .08s",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function formatDueLabel(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Hoje · ${time}`;
  if (diff === 1) return `Amanhã · ${time}`;
  if (diff === -1) return `Ontem · ${time}`;
  if (diff > 0 && diff < 7) {
    const w = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return `${w.charAt(0).toUpperCase() + w.slice(1)} · ${time}`;
  }
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${time}`;
}

// ──────────────────────────────────────────────────────────────────────
//  STATUS MENU (clean dropdown)
// ──────────────────────────────────────────────────────────────────────

function StatusMenu({ current, onChange }: { current: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS[current];
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px 4px 8px",
          borderRadius: 999,
          background: cfg.bg, color: cfg.color,
          border: "none", cursor: "pointer",
          fontSize: 11, fontFamily: "var(--font-sans)",
          fontWeight: 600, letterSpacing: 0.2,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
        {cfg.label}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 41, minWidth: 140,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 4,
          }}>
            {STATUS_ORDER.map((s) => {
              const c = STATUS[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 5,
                    background: s === current ? "var(--surface-2)" : "transparent",
                    border: "none", cursor: "pointer",
                    fontSize: 12, color: "var(--ink-2)", fontFamily: "var(--font-sans)",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = s === current ? "var(--surface-2)" : "transparent")}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  ASSIGNEE PICKER
// ──────────────────────────────────────────────────────────────────────

function AssigneePicker({
  currentId, currentName, currentColor, team, onChange,
}: {
  currentId: number | null;
  currentName: string | null;
  currentColor: string | null;
  team: { id: number; name: string; avatar_color: string | null }[];
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const initials = currentName ? currentName.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title={currentName ?? "Atribuir"}
        style={{
          width: 26, height: 26, borderRadius: "50%",
          background: currentColor ?? "transparent",
          color: "#fff",
          border: currentId ? "none" : "1px dashed var(--border-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, cursor: "pointer",
          fontFamily: "var(--font-sans)",
        }}
      >
        {initials ?? <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>?</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 41, minWidth: 180,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 4,
          }}>
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              style={{
                width: "100%", padding: "6px 10px", borderRadius: 5,
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 12, color: "var(--ink-3)", textAlign: "left",
              }}
            >
              Sem responsável
            </button>
            {team.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onChange(m.id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", borderRadius: 5,
                  background: m.id === currentId ? "var(--surface-2)" : "transparent",
                  border: "none", cursor: "pointer",
                  fontSize: 12, color: "var(--ink-2)", fontFamily: "var(--font-sans)",
                  textAlign: "left",
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: m.avatar_color ?? "var(--ink-3)",
                  color: "#fff", fontSize: 9, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {m.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                {m.name}
              </button>
            ))}
            {team.length === 0 && (
              <div style={{ padding: 10, fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>
                Nenhum membro cadastrado.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  NEW TASK FORM
// ──────────────────────────────────────────────────────────────────────

function NewTaskForm({
  team, onSubmit, submitting, error,
}: {
  team: { id: number; name: string; avatar_color: string | null }[];
  onSubmit: (body: TaskCreate) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueISO, setDueISO] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [platform, setPlatform] = useState<TaskPlatform | "">("");
  const [taskType, setTaskType] = useState<TaskType | "">("");
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [durationMin, setDurationMin] = useState<string>("");
  const [aiScheduled, setAiScheduled] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      due_at: dueISO,
      duration_min: durationMin ? Number(durationMin) : null,
      priority,
      platform: platform || null,
      task_type: taskType || null,
      assignee_id: assigneeId === "" ? null : Number(assigneeId),
      ai_scheduled: aiScheduled,
    });
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 18 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Descreva a tarefa (ex: otimizar bid das campanhas de escala)"
          autoFocus
          required
          style={{ ...inputStyle, fontSize: 15, fontWeight: 500, padding: "10px 12px" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <SelectField
            label="Tipo"
            value={taskType}
            onChange={(v) => setTaskType(v as TaskType | "")}
            options={[["", "— selecione —"], ...Object.entries(TASK_TYPE).map(([k, v]) => [k, v.label] as [string, string])]}
          />
          <SelectField
            label="Plataforma"
            value={platform}
            onChange={(v) => setPlatform(v as TaskPlatform | "")}
            options={[["", "— selecione —"], ...Object.entries(PLATFORM).map(([k, v]) => [k, v.label] as [string, string])]}
          />
          <SelectField
            label="Prioridade"
            value={priority}
            onChange={(v) => setPriority(v as TaskPriority)}
            options={Object.entries(PRIORITY).map(([k, v]) => [k, v.label] as [string, string])}
          />
          <SelectField
            label="Responsável"
            value={assigneeId === "" ? "" : String(assigneeId)}
            onChange={(v) => setAssigneeId(v === "" ? "" : Number(v))}
            options={[["", "— sem responsável —"], ...team.map((m) => [String(m.id), m.name] as [string, string])]}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <FieldLabel>Quando</FieldLabel>
            <DateTimePicker value={dueISO} onChange={setDueISO} />
          </div>
          <div>
            <FieldLabel>Duração estimada</FieldLabel>
            <input
              type="number" min={5} step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="min"
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Notas (opcional)</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Contexto adicional, links, referências…"
            style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-2)" }}>
          <input type="checkbox" checked={aiScheduled} onChange={(e) => setAiScheduled(e.target.checked)} />
          <span>Permitir que o Claude reagende automaticamente</span>
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.4, marginLeft: 4 }}>
            AI
          </span>
        </label>

        {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="submit" className="btn" disabled={submitting || !title.trim()}>
            {submitting ? "Salvando…" : "Criar tarefa"}
          </button>
        </div>
      </div>
    </form>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
      textTransform: "uppercase", marginBottom: 4, fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map(([v, l]) => (
          <option key={v || "none"} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  SKELETON
// ──────────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 16 }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{
          height: 52, borderRadius: 8,
          background: "linear-gradient(90deg, var(--surface), var(--surface-2), var(--surface))",
          backgroundSize: "200% 100%",
          animation: "skeleton-shimmer 1.5s ease-in-out infinite",
          border: "1px solid var(--border)",
        }} />
      ))}
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
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
