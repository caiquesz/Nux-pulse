"use client";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createTask, deleteTask, listTasks, listTeam, updateTask,
  type Task, type TaskCreate, type TaskFilters, type TaskPlatform,
  type TaskPriority, type TaskStatus, type TaskType,
} from "@/lib/api";
import { DateTimePicker } from "./DateTimePicker";
import { PLATFORM, PRIORITY, STATUS, TASK_TYPE } from "./constants";

// ═══════════════════════════════════════════════════════════════════════
//  TASKS TAB — Linear-style: kanban-only, toolbar compacta,
//  filtros via popover, drag-and-drop entre colunas.
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
//  Component principal
// ──────────────────────────────────────────────────────────────────────

export function TasksTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<TaskFilters>({});
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const tasksQ = useQuery({ queryKey: ["tasks", slug, filters], queryFn: () => listTasks(slug, filters), enabled: !!slug });
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });

  // Filtros client-side (period + search) — complementam os server-side
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

  const createMut = useMutation({
    mutationFn: (body: TaskCreate) => createTask(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      setShowForm(false);
    },
  });
  // Optimistic update — drag-and-drop move o card antes do server confirmar.
  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TaskCreate> }) => updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks", slug] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ["tasks", slug] });
      qc.setQueriesData<Task[]>({ queryKey: ["tasks", slug] }, (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === id ? { ...t, ...patch } as Task : t));
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  });
  const editMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TaskCreate> }) => updateTask(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] });
      setEditing(null);
    },
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

  const clearAll = () => { setFilters({}); setPeriod("all"); setSearch(""); };

  // Drag & drop — handler único pro DndContext do board
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const target = e.over?.id as TaskStatus | undefined;
    if (!id || !target) return;
    const t = (tasksQ.data ?? []).find((x) => x.id === id);
    if (!t || t.status === target) return;
    updateMut.mutate({ id, patch: { status: target } });
  };

  return (
    <div>
      {/* ── Toolbar única ───────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)", fontSize: 12, pointerEvents: "none" }}>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa…"
            style={{
              width: "100%", padding: "7px 11px 7px 30px", height: 32,
              borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--ink)",
              fontSize: 12.5, outline: "none",
            }}
          />
        </div>

        <FiltersPopover
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filters={filters}
          period={period}
          onFiltersChange={setFilters}
          onPeriodChange={setPeriod}
          team={teamQ.data ?? []}
          totals={tasksQ.data ?? []}
          activeCount={activeFilterCount}
        />

        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            style={{
              height: 32, padding: "0 12px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink-3)", fontSize: 12, cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Limpar
          </button>
        )}

        <div style={{ marginLeft: "auto" }}>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancelar" : "+ Nova tarefa"}
          </button>
        </div>
      </div>

      {/* ── Faixa de filtros ativos (chips removíveis) ──────────────── */}
      {activeFilterCount > 0 && (
        <ActiveFiltersBar
          filters={filters}
          period={period}
          search={search}
          onClearStatus={() => setFilters({ ...filters, status: undefined })}
          onClearPriority={() => setFilters({ ...filters, priority: undefined })}
          onClearPlatform={() => setFilters({ ...filters, platform: undefined })}
          onClearTaskType={() => setFilters({ ...filters, task_type: undefined })}
          onClearAssignee={() => setFilters({ ...filters, assignee_id: undefined })}
          onClearPeriod={() => setPeriod("all")}
          onClearSearch={() => setSearch("")}
          team={teamQ.data ?? []}
        />
      )}

      {showForm && !editing && (
        <div style={{ margin: "8px 0 16px" }}>
          <NewTaskForm
            team={teamQ.data ?? []}
            onSubmit={(body) => createMut.mutate(body)}
            onCancel={() => setShowForm(false)}
            submitting={createMut.isPending}
            error={createMut.error ? (createMut.error as Error).message : null}
          />
        </div>
      )}

      {editing && (
        <TaskEditModal
          task={editing}
          team={teamQ.data ?? []}
          onSubmit={(patch) => editMut.mutate({ id: editing.id, patch })}
          onCancel={() => setEditing(null)}
          submitting={editMut.isPending}
          error={editMut.error ? (editMut.error as Error).message : null}
        />
      )}

      {/* ── Conteúdo ────────────────────────────────────────────────── */}
      {tasksQ.isLoading && <SkeletonBoard />}
      {tasksQ.isError && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <strong>Erro ao carregar.</strong>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{(tasksQ.error as Error)?.message}</div>
        </div>
      )}
      {!tasksQ.isLoading && filtered.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center", marginTop: 12 }}>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 12 }}>
            {activeFilterCount > 0 ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa ainda."}
          </p>
          {!showForm && activeFilterCount === 0 && (
            <button className="btn" onClick={() => setShowForm(true)}>+ Criar primeira tarefa</button>
          )}
        </div>
      )}

      {!tasksQ.isLoading && filtered.length > 0 && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <KanbanBoard
            tasks={filtered}
            onEdit={(t) => { setShowForm(false); setEditing(t); }}
            onDelete={(id) => {
              const t = (tasksQ.data ?? []).find((x) => x.id === id);
              if (t && confirm(`Excluir "${t.title}"?`)) deleteMut.mutate(id);
            }}
          />
        </DndContext>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  FILTERS POPOVER — botão "Filtros" abre painel com Status/Período/Plataforma/Prioridade/Responsável
// ──────────────────────────────────────────────────────────────────────

function FiltersPopover({
  open, onOpenChange, filters, period, onFiltersChange, onPeriodChange, team, totals, activeCount,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  filters: TaskFilters;
  period: PeriodFilter;
  onFiltersChange: (f: TaskFilters) => void;
  onPeriodChange: (p: PeriodFilter) => void;
  team: { id: number; name: string; avatar_color: string | null }[];
  totals: Task[];
  activeCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  const countByStatus = (s: TaskStatus) => totals.filter((t) => t.status === s).length;
  const countByPlatform = (p: TaskPlatform) => totals.filter((t) => t.platform === p).length;
  const visiblePlatforms = (Object.keys(PLATFORM) as TaskPlatform[])
    .filter((p) => p !== "outro")
    .filter((p) => countByPlatform(p) > 0 || filters.platform === p);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => onOpenChange(!open)}
        style={{
          height: 32, padding: "0 12px", borderRadius: 8,
          border: `1px solid ${activeCount > 0 ? "var(--ink-2)" : "var(--border)"}`,
          background: activeCount > 0 ? "var(--surface-2)" : "var(--surface)",
          color: "var(--ink-2)", fontSize: 12, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-sans)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="10" y1="18" x2="14" y2="18" />
        </svg>
        Filtros
        {activeCount > 0 && (
          <span className="mono" style={{
            fontSize: 10, fontWeight: 700, padding: "1px 6px",
            borderRadius: 999, background: "var(--ink)", color: "var(--accent-ink)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
          width: 320,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 12px 36px rgba(0,0,0,0.32)",
          padding: 12,
          display: "grid", gap: 12,
        }}>
          <FilterBlock label="Status">
            <PopChip on={!filters.status} onClick={() => onFiltersChange({ ...filters, status: undefined })}>
              Todos <Count n={totals.length} />
            </PopChip>
            {STATUS_ORDER.map((s) => {
              const cfg = STATUS[s];
              return (
                <PopChip
                  key={s}
                  on={filters.status === s}
                  onClick={() => onFiltersChange({ ...filters, status: filters.status === s ? undefined : s })}
                  dot={cfg.color}
                >
                  {cfg.label} <Count n={countByStatus(s)} />
                </PopChip>
              );
            })}
          </FilterBlock>

          <FilterBlock label="Período">
            {(Object.keys(PERIOD_LABEL) as PeriodFilter[]).map((p) => (
              <PopChip key={p} on={period === p} onClick={() => onPeriodChange(p)}>
                {PERIOD_LABEL[p]}
              </PopChip>
            ))}
          </FilterBlock>

          {visiblePlatforms.length > 0 && (
            <FilterBlock label="Plataforma">
              <PopChip on={!filters.platform} onClick={() => onFiltersChange({ ...filters, platform: undefined })}>
                Todas
              </PopChip>
              {visiblePlatforms.map((p) => {
                const cfg = PLATFORM[p];
                return (
                  <PopChip
                    key={p}
                    on={filters.platform === p}
                    onClick={() => onFiltersChange({ ...filters, platform: filters.platform === p ? undefined : p })}
                    dot={cfg.color}
                  >
                    {cfg.label} <Count n={countByPlatform(p)} />
                  </PopChip>
                );
              })}
            </FilterBlock>
          )}

          <FilterBlock label="Prioridade">
            <PopChip on={!filters.priority} onClick={() => onFiltersChange({ ...filters, priority: undefined })}>
              Todas
            </PopChip>
            {(Object.keys(PRIORITY) as TaskPriority[]).map((p) => {
              const cfg = PRIORITY[p];
              return (
                <PopChip
                  key={p}
                  on={filters.priority === p}
                  onClick={() => onFiltersChange({ ...filters, priority: filters.priority === p ? undefined : p })}
                  dot={cfg.color}
                >
                  {cfg.label}
                </PopChip>
              );
            })}
          </FilterBlock>

          {team.length > 0 && (
            <FilterBlock label="Responsável">
              <PopChip on={!filters.assignee_id} onClick={() => onFiltersChange({ ...filters, assignee_id: undefined })}>
                Todos
              </PopChip>
              {team.map((m) => (
                <PopChip
                  key={m.id}
                  on={filters.assignee_id === m.id}
                  onClick={() => onFiltersChange({ ...filters, assignee_id: filters.assignee_id === m.id ? undefined : m.id })}
                  dot={m.avatar_color ?? "var(--ink-3)"}
                >
                  {m.name.split(" ")[0]}
                </PopChip>
              ))}
            </FilterBlock>
          )}
        </div>
      )}
    </div>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
        textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function PopChip({ on, onClick, dot, children }: {
  on?: boolean; onClick?: () => void; dot?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${on ? "var(--ink-2)" : "var(--border)"}`,
        background: on ? "var(--ink)" : "var(--surface)",
        color: on ? "var(--accent-ink)" : "var(--ink-2)",
        fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font-sans)",
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
    <span className="mono" style={{ marginLeft: 2, fontSize: 9, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
      {n}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  ACTIVE FILTERS BAR — chips removíveis dos filtros aplicados
// ──────────────────────────────────────────────────────────────────────

function ActiveFiltersBar({
  filters, period, search,
  onClearStatus, onClearPriority, onClearPlatform, onClearTaskType, onClearAssignee, onClearPeriod, onClearSearch,
  team,
}: {
  filters: TaskFilters; period: PeriodFilter; search: string;
  onClearStatus: () => void; onClearPriority: () => void; onClearPlatform: () => void;
  onClearTaskType: () => void; onClearAssignee: () => void; onClearPeriod: () => void; onClearSearch: () => void;
  team: { id: number; name: string; avatar_color: string | null }[];
}) {
  const items: { label: string; dot?: string; onClear: () => void }[] = [];
  if (search) items.push({ label: `"${search}"`, onClear: onClearSearch });
  if (filters.status) items.push({ label: STATUS[filters.status].label, dot: STATUS[filters.status].color, onClear: onClearStatus });
  if (period !== "all") items.push({ label: PERIOD_LABEL[period], onClear: onClearPeriod });
  if (filters.platform) items.push({ label: PLATFORM[filters.platform].label, dot: PLATFORM[filters.platform].color, onClear: onClearPlatform });
  if (filters.priority) items.push({ label: PRIORITY[filters.priority].label, dot: PRIORITY[filters.priority].color, onClear: onClearPriority });
  if (filters.task_type) items.push({ label: TASK_TYPE[filters.task_type].label, onClear: onClearTaskType });
  if (filters.assignee_id) {
    const m = team.find((x) => x.id === filters.assignee_id);
    if (m) items.push({ label: m.name.split(" ")[0], dot: m.avatar_color ?? "var(--ink-3)", onClear: onClearAssignee });
  }

  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 4px 3px 9px",
            borderRadius: 999,
            background: "var(--surface-2)", border: "1px solid var(--border)",
            fontSize: 11, color: "var(--ink-2)", fontFamily: "var(--font-sans)",
          }}
        >
          {it.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: it.dot }} />}
          {it.label}
          <button
            onClick={it.onClear}
            aria-label={`Remover ${it.label}`}
            style={{
              background: "transparent", border: "none", color: "var(--ink-4)",
              cursor: "pointer", padding: "0 4px", fontSize: 13, lineHeight: 1, borderRadius: 999,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-4)")}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  KANBAN BOARD — 4 colunas drag-and-drop via @dnd-kit
// ──────────────────────────────────────────────────────────────────────

function KanbanBoard({
  tasks, onEdit, onDelete,
}: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div style={{
      display: "grid",
      // gap=0: o respiro entre colunas vem do padding interno + linha sutil.
      gridTemplateColumns: "repeat(4, minmax(260px, 1fr))",
      gap: 0,
      minHeight: "calc(100vh - 280px)",
      alignItems: "stretch",
      overflowX: "auto",
      paddingBottom: 2,
    }}>
      {STATUS_ORDER.map((st, i) => {
        const col = tasks.filter((t) => t.status === st);
        const isLast = i === STATUS_ORDER.length - 1;
        return (
          <KanbanColumn
            key={st}
            status={st}
            tasks={col}
            isLast={isLast}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

function KanbanColumn({
  status, tasks, isLast, onEdit, onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  isLast: boolean;
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg = STATUS[status];
  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex", flexDirection: "column", minHeight: 0,
        // Padding interno gera respiro nas duas laterais da divisória vertical.
        padding: "0 16px",
        background: isOver ? "var(--surface-2)" : "transparent",
        outline: isOver ? `1px dashed ${cfg.color}` : "1px dashed transparent",
        outlineOffset: -1,
        borderRadius: 8,
        // Linha sutil entre colunas (todas exceto a última).
        borderRight: isLast ? "none" : "1px solid var(--border)",
        transition: "background .12s, outline-color .12s",
      }}
    >
      {/* Header — Linear-style: dot · label · count em ink-3 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 0 10px",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--ink)",
          fontFamily: "var(--font-sans)",
        }}>
          {cfg.label}
        </span>
        <span className="mono" style={{
          fontSize: 11, color: "var(--ink-4)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        flex: 1, minHeight: 60,
      }}>
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ task, onEdit, onDelete }: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const [hover, setHover] = useState(false);
  const priCfg = PRIORITY[task.priority];
  const platformCfg = task.platform ? PLATFORM[task.platform] : null;
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && task.status !== "done" && due < new Date();
  const initials = task.assignee_name ? task.assignee_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() : null;
  const isDone = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        // Click só dispara edit se não foi um drag
        if ((e as React.MouseEvent).detail === 0) return;
        onEdit();
      }}
      role="button"
      tabIndex={0}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `2px solid ${priCfg.color}`,
        borderRadius: 8,
        padding: "9px 10px",
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.5 : isDone ? 0.62 : 1,
        userSelect: "none",
        transition: "border-color .08s, background .08s",
      }}
    >
      {/* Título + ações no hover */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <div style={{
          flex: 1,
          fontSize: 13, fontWeight: 500, color: "var(--ink)", lineHeight: 1.35,
          textDecoration: isDone ? "line-through" : "none",
          wordBreak: "break-word",
        }}>
          {task.title}
        </div>
        {hover && (
          <div style={{ display: "flex", gap: 2, marginTop: -2 }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              title="Editar"
              style={{
                background: "transparent", border: "none",
                color: "var(--ink-3)", cursor: "pointer", padding: 2,
                borderRadius: 3, lineHeight: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Excluir"
              style={{
                background: "transparent", border: "none",
                color: "var(--ink-4)", cursor: "pointer", padding: 2,
                fontSize: 11, lineHeight: 1,
              }}
            >✕</button>
          </div>
        )}
      </div>

      {/* Footer: meta line — prioridade · data · plataforma · AI · assignee */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7, minHeight: 16 }}>
        {due && (
          <span className="mono" style={{
            fontSize: 10, color: overdue ? "var(--neg)" : "var(--ink-3)",
            fontWeight: overdue ? 600 : 400, fontVariantNumeric: "tabular-nums",
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>
            {overdue && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--neg)" }} />}
            {formatDueLabel(due)}
          </span>
        )}
        {platformCfg && (
          <span
            title={platformCfg.label}
            style={{
              fontSize: 9.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)",
              letterSpacing: 0.3,
            }}
          >
            · {platformCfg.label.toLowerCase()}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {task.ai_scheduled && (
          <span
            title="Claude pode reagendar"
            className="mono"
            style={{
              fontSize: 8, color: "oklch(0.55 0.18 130)", letterSpacing: 0.5,
              textTransform: "uppercase", fontWeight: 700,
            }}
          >
            ai
          </span>
        )}
        {initials && (
          <span
            title={task.assignee_name ?? ""}
            style={{
              width: 18, height: 18, borderRadius: "50%",
              background: task.assignee_color ?? "var(--ink-3)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, fontFamily: "var(--font-sans)",
              flexShrink: 0,
            }}
          >
            {initials}
          </span>
        )}
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
//  SKELETON
// ──────────────────────────────────────────────────────────────────────

function SkeletonBoard() {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, minmax(260px, 1fr))", gap: 12, marginTop: 4,
    }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 28, width: 110, borderRadius: 6, background: "var(--surface-2)" }} />
          {[...Array(2)].map((_, j) => (
            <div key={j} style={{
              height: 64, borderRadius: 8,
              background: "linear-gradient(90deg, var(--surface), var(--surface-2), var(--surface))",
              backgroundSize: "200% 100%",
              animation: "skeleton-shimmer 1.5s ease-in-out infinite",
              border: "1px solid var(--border)",
            }} />
          ))}
        </div>
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

// ──────────────────────────────────────────────────────────────────────
//  NEW TASK FORM
// ──────────────────────────────────────────────────────────────────────

function NewTaskForm({
  team, onSubmit, onCancel, submitting, error, initial, submitLabel = "Criar tarefa",
}: {
  team: { id: number; name: string; avatar_color: string | null }[];
  onSubmit: (body: TaskCreate) => void;
  onCancel?: () => void;
  submitting: boolean;
  error: string | null;
  initial?: Task;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueISO, setDueISO] = useState<string | null>(initial?.due_at ?? null);
  const [priority, setPriority] = useState<TaskPriority>((initial?.priority as TaskPriority) ?? "media");
  const [platform, setPlatform] = useState<TaskPlatform | "">((initial?.platform as TaskPlatform) ?? "");
  const [taskType, setTaskType] = useState<TaskType | "">((initial?.task_type as TaskType) ?? "");
  const [assigneeId, setAssigneeId] = useState<number | "">(initial?.assignee_id ?? "");
  const [durationMin, setDurationMin] = useState<string>(initial?.duration_min ? String(initial.duration_min) : "");
  const [aiScheduled, setAiScheduled] = useState(initial?.ai_scheduled ?? false);

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
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn" disabled={submitting || !title.trim()}>
            {submitting ? "Salvando…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  EDIT MODAL — overlay com mesmo form pré-preenchido
// ──────────────────────────────────────────────────────────────────────

function TaskEditModal({
  task, team, onSubmit, onCancel, submitting, error,
}: {
  task: Task;
  team: { id: number; name: string; avatar_color: string | null }[];
  onSubmit: (patch: Partial<TaskCreate>) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(10, 10, 8, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "8vh 16px 16px",
        overflow: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 720, position: "relative" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
          <div className="mono" style={{
            fontSize: 10, color: "rgba(245,242,235,0.55)", letterSpacing: 1.2,
            textTransform: "uppercase", fontWeight: 600,
          }}>
            Editando tarefa
          </div>
          <button
            onClick={onCancel}
            aria-label="Fechar"
            style={{
              background: "transparent", border: "none", color: "rgba(245,242,235,0.6)",
              fontSize: 18, cursor: "pointer", padding: "2px 8px", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <NewTaskForm
          team={team}
          initial={task}
          submitLabel="Salvar alterações"
          onSubmit={onSubmit}
          onCancel={onCancel}
          submitting={submitting}
          error={error}
        />
      </div>
    </div>
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
