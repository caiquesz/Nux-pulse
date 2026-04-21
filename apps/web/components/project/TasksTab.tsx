"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  createTask, deleteTask, listTasks, listTeam, updateTask,
  type Task, type TaskCreate, type TaskPriority, type TaskScope, type TaskStatus,
} from "@/lib/api";

const STATUS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "briefing",   label: "Briefing",   color: "var(--info)"   },
  { key: "producao",   label: "Produção",   color: "var(--cobalt)" },
  { key: "aprovacao",  label: "Aprovação",  color: "var(--warn)"   },
  { key: "publicado",  label: "Publicado",  color: "var(--pos)"    },
  { key: "arquivado",  label: "Arquivado",  color: "var(--ink-4)"  },
];

const PRIORITY_STYLE: Record<TaskPriority, { color: string; label: string }> = {
  baixa:   { color: "var(--ink-4)", label: "Baixa" },
  media:   { color: "var(--info)",  label: "Média" },
  alta:    { color: "var(--warn)",  label: "Alta"  },
  urgente: { color: "var(--neg)",   label: "Urgente" },
};

export function TasksTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const tasksQ = useQuery({ queryKey: ["tasks", slug], queryFn: () => listTasks(slug), enabled: !!slug });
  const teamQ  = useQuery({ queryKey: ["team"],        queryFn: () => listTeam() });

  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);

  const tasks = (tasksQ.data ?? []).filter((t) => filterStatus === "all" || t.status === filterStatus);

  const createMut = useMutation({
    mutationFn: (body: TaskCreate) => createTask(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] });
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

  const byStatus = STATUS.reduce<Record<TaskStatus, number>>((acc, s) => {
    acc[s.key] = (tasksQ.data ?? []).filter((t) => t.status === s.key).length;
    return acc;
  }, { briefing: 0, producao: 0, aprovacao: 0, publicado: 0, arquivado: 0 });

  return (
    <div>
      {/* Toolbar: filtros + novo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="seg" style={{ fontSize: 11 }}>
          <button className={filterStatus === "all" ? "on" : ""} onClick={() => setFilterStatus("all")}>
            Todas <span className="mono" style={{ marginLeft: 4, opacity: 0.5 }}>{tasksQ.data?.length ?? 0}</span>
          </button>
          {STATUS.filter((s) => s.key !== "arquivado").map((s) => (
            <button key={s.key} className={filterStatus === s.key ? "on" : ""} onClick={() => setFilterStatus(s.key)}>
              {s.label} <span className="mono" style={{ marginLeft: 4, opacity: 0.5 }}>{byStatus[s.key]}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancelar" : "+ Nova tarefa"}
          </button>
        </div>
      </div>

      {showForm && (
        <NewTaskForm
          team={teamQ.data ?? []}
          onSubmit={(body) => createMut.mutate(body)}
          submitting={createMut.isPending}
          error={createMut.error ? (createMut.error as Error).message : null}
        />
      )}

      {/* Loading / Error */}
      {tasksQ.isLoading && <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando…</p>}
      {tasksQ.isError && (
        <div className="card" style={{ padding: 14, borderLeft: "3px solid var(--neg)" }}>
          <strong>Erro ao carregar tarefas.</strong>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            {(tasksQ.error as Error)?.message}
          </div>
        </div>
      )}

      {tasks.length === 0 && !tasksQ.isLoading && (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 10 }}>
            {filterStatus === "all" ? "Nenhuma tarefa ainda." : `Nenhuma tarefa em ${STATUS.find((s) => s.key === filterStatus)?.label.toLowerCase()}.`}
          </p>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)}>+ Criar primeira tarefa</button>
          )}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onChangeStatus={(next) => updateMut.mutate({ id: t.id, patch: { status: next } })}
            onDelete={() => {
              if (confirm(`Excluir "${t.title}"?`)) deleteMut.mutate(t.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────
function TaskRow({ task, onChangeStatus, onDelete }: {
  task: Task;
  onChangeStatus: (s: TaskStatus) => void;
  onDelete: () => void;
}) {
  const statusCfg = STATUS.find((s) => s.key === task.status) ?? STATUS[0];
  const priCfg = PRIORITY_STYLE[task.priority];
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && task.status !== "publicado" && task.status !== "arquivado" && due < new Date();

  return (
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto auto",
        gap: 14, alignItems: "center", padding: "12px 14px",
        borderLeft: `3px solid ${statusCfg.color}`,
      }}
    >
      {/* Status selector */}
      <select
        value={task.status}
        onChange={(e) => onChangeStatus(e.target.value as TaskStatus)}
        style={{
          fontSize: 11, padding: "4px 8px",
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: 6, color: statusCfg.color, fontFamily: "var(--font-mono)",
          fontWeight: 600, cursor: "pointer",
        }}
        title="Mudar status"
      >
        {STATUS.map((s) => (
          <option key={s.key} value={s.key}>{s.label.toUpperCase()}</option>
        ))}
      </select>

      {/* Título + descrição */}
      <div>
        <div style={{
          fontSize: 13, fontWeight: 600,
          textDecoration: task.status === "publicado" || task.status === "arquivado" ? "line-through" : "none",
          opacity: task.status === "arquivado" ? 0.6 : 1,
        }}>
          {task.title}
          {task.scope === "interno" && (
            <span style={{
              marginLeft: 8, fontSize: 9, padding: "1px 5px",
              background: "var(--surface-3)", color: "var(--ink-4)",
              borderRadius: 3, fontFamily: "var(--font-mono)", letterSpacing: 0.5, textTransform: "uppercase",
            }}>INTERNO</span>
          )}
          {task.ai_scheduled && (
            <span title="Claude pode reagendar" style={{
              marginLeft: 6, fontSize: 9, padding: "1px 5px",
              background: "oklch(0.90 0.22 125 / 0.18)", color: "oklch(0.50 0.22 125)",
              borderRadius: 3, fontFamily: "var(--font-mono)", letterSpacing: 0.5, textTransform: "uppercase",
            }}>◆ AI</span>
          )}
        </div>
        {task.description && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, maxWidth: 540, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.description}
          </div>
        )}
      </div>

      {/* Due */}
      <div style={{ textAlign: "right", minWidth: 100 }}>
        {due ? (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: overdue ? "var(--neg)" : "var(--ink-3)",
              fontWeight: overdue ? 600 : 400,
              letterSpacing: 0.3,
            }}
            title={due.toLocaleString("pt-BR")}
          >
            {due.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            {" "}
            {due.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>sem data</span>
        )}
        <div style={{ fontSize: 10, color: priCfg.color, fontFamily: "var(--font-mono)", letterSpacing: 0.3, marginTop: 2 }}>
          {priCfg.label}
        </div>
      </div>

      {/* Assignee */}
      <div style={{ minWidth: 28 }}>
        {task.assignee_name ? (
          <div
            title={task.assignee_name}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: task.assignee_color ?? "var(--surface-3)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600,
            }}
          >
            {task.assignee_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
          </div>
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1px dashed var(--border-2)", color: "var(--ink-4)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
          }}>?</div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="icon-btn"
        title="Excluir"
        style={{ color: "var(--ink-4)" }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────
function NewTaskForm({
  team, onSubmit, submitting, error,
}: {
  team: { id: number; name: string; avatar_color: string | null }[];
  onSubmit: (body: TaskCreate) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [scope, setScope] = useState<TaskScope>("cliente");
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState("");
  const [durationMin, setDurationMin] = useState<string>("");
  const [aiScheduled, setAiScheduled] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    let due_at: string | null = null;
    if (due) {
      // Monta ISO com time local (se não veio time, assume 09:00)
      due_at = new Date(`${due}T${time || "09:00"}:00`).toISOString();
    }
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      due_at,
      duration_min: durationMin ? Number(durationMin) : null,
      priority,
      scope,
      assignee_id: assigneeId === "" ? null : Number(assigneeId),
      ai_scheduled: aiScheduled,
    });
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Revisar criativos da campanha de vendas"
          autoFocus
          required
          style={inputStyle}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" style={inputStyle} />
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} style={inputStyle}>
            <option value="baixa">Prioridade baixa</option>
            <option value="media">Prioridade média</option>
            <option value="alta">Prioridade alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))}
            style={inputStyle}
          >
            <option value="">Sem responsável</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          style={{
            background: "transparent", border: "none", color: "var(--ink-3)",
            fontSize: 11, cursor: "pointer", alignSelf: "flex-start", padding: 0,
          }}
        >
          {more ? "— Menos opções" : "+ Mais opções"}
        </button>

        {more && (
          <div style={{ display: "grid", gap: 10 }}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição / notas"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="Duração (min)"
                min="5"
                style={inputStyle}
              />
              <select value={scope} onChange={(e) => setScope(e.target.value as TaskScope)} style={inputStyle}>
                <option value="cliente">Escopo: do cliente</option>
                <option value="interno">Escopo: interno (agência)</option>
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-2)" }}>
                <input type="checkbox" checked={aiScheduled} onChange={(e) => setAiScheduled(e.target.checked)} />
                Deixar Claude reagendar
              </label>
            </div>
          </div>
        )}

        {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn" disabled={submitting || !title.trim()}>
            {submitting ? "Salvando…" : "Criar tarefa"}
          </button>
        </div>
      </div>
    </form>
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
